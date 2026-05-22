/**
 * Planning Center Online API Client
 * Uses OAuth 2.0 Bearer tokens with automatic refresh.
 */
import axios, { AxiosInstance, AxiosError } from "axios";
import https from "https";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { pcoTokens } from "../../drizzle/schema";
import { ENV } from "../_core/env";

const PCO_BASE_URL = "https://api.planningcenteronline.com";
const PCO_TOKEN_URL = "https://api.planningcenteronline.com/oauth/token";
const PCO_AUTHORIZE_URL = "https://api.planningcenteronline.com/oauth/authorize";

// Rate limit: 100 requests per 20 seconds
const RATE_LIMIT_DELAY_MS = 210;

// PCO OAuth scopes we need
export const PCO_SCOPES = [
  "check_ins",
  "giving",
  "groups",
  "calendar",
  "people",
  "services",
];

export interface PcoApiResponse<T = any> {
  data: T | T[];
  included?: any[];
  meta?: {
    total_count?: number;
    count?: number;
    next?: { offset: number };
  };
  links?: {
    self?: string;
    next?: string;
  };
}

// ============================================================
// OAuth URL helpers
// ============================================================

/**
 * Build the PCO authorization URL for the OAuth flow.
 * `redirectUri` must match one of the registered callback URLs.
 */
export function getPcoAuthorizeUrl(redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    client_id: ENV.pcoAppId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: PCO_SCOPES.join(" "),
  });
  if (state) params.set("state", state);
  return `${PCO_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
}> {
  const response = await axios.post(PCO_TOKEN_URL, {
    grant_type: "authorization_code",
    code,
    client_id: ENV.pcoAppId,
    client_secret: ENV.pcoSecret,
    redirect_uri: redirectUri,
  });

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    expiresIn: response.data.expires_in || 7200,
    tokenType: response.data.token_type || "Bearer",
    scope: response.data.scope || PCO_SCOPES.join(" "),
  };
}

/**
 * Refresh an expired access token.
 * Retries up to 3 times with exponential backoff to handle transient failures.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const MAX_REFRESH_RETRIES = 3;
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_REFRESH_RETRIES; attempt++) {
    try {
      const response = await axios.post(PCO_TOKEN_URL, {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: ENV.pcoAppId,
        client_secret: ENV.pcoSecret,
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || refreshToken,
        expiresIn: response.data.expires_in || 7200,
      };
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;
      // If PCO returns 400/401/403, the refresh token itself is invalid — don't retry
      if (status && status >= 400 && status < 500) {
        console.error(`[PCO] Refresh token rejected by PCO (HTTP ${status}). Re-authorization required.`);
        break;
      }
      // Transient error — retry with backoff
      const backoffMs = Math.min(2 ** attempt * 2000, 10000);
      console.warn(`[PCO] Token refresh attempt ${attempt + 1}/${MAX_REFRESH_RETRIES} failed: ${err.message}. Retrying in ${backoffMs}ms...`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  throw lastError || new Error("Token refresh failed after retries");
}

// ============================================================
// Token storage helpers
// ============================================================

/**
 * Store tokens in the database (upsert — only one row).
 */
export async function storeTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope?: string;
  organizationName?: string;
  organizationId?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

  const existing = await db.select().from(pcoTokens).limit(1);
  if (existing.length > 0) {
    await db
      .update(pcoTokens)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt,
        scope: tokens.scope || null,
        organizationName: tokens.organizationName || existing[0].organizationName,
        organizationId: tokens.organizationId || existing[0].organizationId,
      })
      .where(eq(pcoTokens.id, existing[0].id));
  } else {
    await db.insert(pcoTokens).values({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: "Bearer",
      expiresAt,
      scope: tokens.scope || null,
      organizationName: tokens.organizationName || null,
      organizationId: tokens.organizationId || null,
    });
  }
}

/**
 * Get a valid access token, refreshing if expired.
 * Now includes retry logic and notifies owner on permanent failure.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select().from(pcoTokens).limit(1);
  if (rows.length === 0) return null;

  const token = rows[0];

  // Check if token is expired (with 30-minute buffer to handle container recycles)
  const bufferMs = 30 * 60 * 1000;
  if (token.expiresAt && new Date(token.expiresAt).getTime() - bufferMs < Date.now()) {
    console.log("[PCO] Access token expired or expiring soon, refreshing...");
    try {
      const refreshed = await refreshAccessToken(token.refreshToken);
      await storeTokens({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresIn: refreshed.expiresIn,
      });
      console.log("[PCO] Token refreshed successfully, new expiry:", new Date(Date.now() + refreshed.expiresIn * 1000).toISOString());
      return refreshed.accessToken;
    } catch (err: any) {
      console.error("[PCO] Token refresh permanently failed:", err.message);
      // Notify owner that PCO connection is broken
      try {
        const { notifyOwner } = await import("../_core/notification");
        await notifyOwner({
          title: "⚠️ Planning Center Disconnected",
          content: `The PCO OAuth token could not be refreshed automatically. Error: ${err.message}. Please reconnect in Settings > Planning Center.`,
        });
      } catch (_) { /* notification is best-effort */ }
      return null;
    }
  }

  return token.accessToken;
}

/**
 * Delete stored tokens (disconnect).
 */
export async function deleteTokens(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(pcoTokens);
}

/**
 * Get stored token info (for UI display).
 * If the token is expired, attempts a refresh before reporting status.
 */
export async function getTokenInfo(): Promise<{
  connected: boolean;
  organizationName?: string;
  expiresAt?: Date;
  scope?: string;
} | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select().from(pcoTokens).limit(1);
  if (rows.length === 0) return { connected: false };

  const token = rows[0];

  // If token is expired, try to refresh it before reporting status
  const bufferMs = 5 * 60 * 1000;
  if (token.expiresAt && new Date(token.expiresAt).getTime() - bufferMs < Date.now()) {
    console.log("[PCO] Token expired during status check, attempting refresh...");
    const refreshedToken = await getValidAccessToken();
    if (!refreshedToken) {
      return { connected: false, organizationName: token.organizationName || undefined };
    }
    // Re-read the updated token
    const updatedRows = await db.select().from(pcoTokens).limit(1);
    if (updatedRows.length === 0) return { connected: false };
    return {
      connected: true,
      organizationName: updatedRows[0].organizationName || undefined,
      expiresAt: updatedRows[0].expiresAt || undefined,
      scope: updatedRows[0].scope || undefined,
    };
  }

  return {
    connected: true,
    organizationName: token.organizationName || undefined,
    expiresAt: token.expiresAt || undefined,
    scope: token.scope || undefined,
  };
}

// ============================================================
// OAuth-based PCO Client
// ============================================================

export class PcoClient {
  private client: AxiosInstance;
  private lastRequestTime = 0;
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    // Use a fresh HTTPS agent per client with keepAlive disabled.
    // This prevents silent TCP stalls where an idle keep-alive connection
    // is reused but the remote side has closed it — the socket hangs
    // indefinitely without triggering the axios `timeout` (which only
    // covers response-header arrival, not socket-level inactivity).
    const httpsAgent = new https.Agent({
      keepAlive: false,
      timeout: 30000, // socket-level timeout (ms) — fires on TCP stall
    });
    this.client = axios.create({
      baseURL: PCO_BASE_URL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,   // axios response-header timeout
      httpsAgent,
    });
  }

  /**
   * Rate-limited GET request with auto-retry on 401 (token refresh) and
   * exponential backoff on 429 (rate limit). Respects the Retry-After header.
   */
  private async rateLimitedGet<T = any>(url: string, params?: Record<string, any>): Promise<PcoApiResponse<T>> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS - elapsed));
    }
    this.lastRequestTime = Date.now();

    const MAX_RETRIES = 8;
    let attempt = 0;

    while (true) {
      try {
        // Use AbortController with a hard 25s deadline per request.
        // This catches TCP stalls that axios timeout (response-header only)
        // and https.Agent timeout (socket-level) sometimes miss.
        const controller = new AbortController();
        const abortTimer = setTimeout(() => controller.abort(), 25_000);
        const response = await this.client.get(url, { params, signal: controller.signal as any });
        clearTimeout(abortTimer);
        return response.data;
      } catch (error: any) {
        // Treat AbortController cancellation as a network error for retry
        if (error.name === 'CanceledError' || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
          const isRetryable = attempt < MAX_RETRIES;
          if (isRetryable) {
            attempt++;
            const backoffMs = Math.min(2 ** attempt * 1000, 30000);
            console.warn(`[PCO API] Request aborted (timeout) on ${url} attempt ${attempt}/${MAX_RETRIES}. Waiting ${backoffMs}ms...`);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            this.lastRequestTime = Date.now();
            continue;
          }
        }
        const status = error.response?.status;

        // 429 — rate limited: back off and retry
        if (status === 429 && attempt < MAX_RETRIES) {
          attempt++;
          const retryAfterHeader = error.response?.headers?.['retry-after'];
          const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
          // Use Retry-After if provided, otherwise exponential: 2s, 4s, 8s, ... capped at 60s
          const backoffMs = retryAfterSec > 0
            ? retryAfterSec * 1000
            : Math.min(2 ** attempt * 1000, 60000);
          console.warn(`[PCO API] 429 rate limit on ${url} (attempt ${attempt}/${MAX_RETRIES}). Waiting ${backoffMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          this.lastRequestTime = Date.now();
          continue;
        }

        // Network/TLS errors — retry with backoff
        const isNetworkError = !status && (
          error.code === 'ECONNRESET' ||
          error.code === 'ECONNABORTED' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ENOTFOUND' ||
          error.code === 'EPIPE' ||
          (error.message && (
            error.message.includes('socket disconnected') ||
            error.message.includes('TLS connection') ||
            error.message.includes('network socket') ||
            error.message.includes('ECONNRESET')
          ))
        );
        if (isNetworkError && attempt < MAX_RETRIES) {
          attempt++;
          const backoffMs = Math.min(2 ** attempt * 1000, 30000);
          console.warn(`[PCO API] Network error on ${url} (${error.code || error.message}) attempt ${attempt}/${MAX_RETRIES}. Waiting ${backoffMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          this.lastRequestTime = Date.now();
          continue;
        }

        // 401 — try refreshing the token once
        if (status === 401 && attempt === 0) {
          attempt++;
          console.log("[PCO] Got 401, attempting token refresh...");
          const newToken = await getValidAccessToken();
          if (newToken && newToken !== this.accessToken) {
            this.accessToken = newToken;
            this.client.defaults.headers.Authorization = `Bearer ${newToken}`;
            continue;
          }
        }

        console.error(`[PCO API] Error on GET ${url}:`, status, error.message);
        throw error;
      }
    }
  }

  /**
   * Paginate through all results from a PCO endpoint.
   */
  async paginateAll<T = any>(
    url: string,
    params?: Record<string, any>,
    maxPages = 100
  ): Promise<{ data: T[]; included: any[] }> {
    const allData: T[] = [];
    const allIncluded: any[] = [];
    let offset = 0;
    let page = 0;

    while (page < maxPages) {
      const response = await this.rateLimitedGet<T>(url, {
        ...params,
        per_page: 100,
        offset,
      });

      const responseData = Array.isArray(response.data) ? response.data : [response.data];
      allData.push(...responseData);

      if (response.included) {
        allIncluded.push(...response.included);
      }

      // Check if there are more pages
      const totalCount = response.meta?.total_count;
      if (totalCount !== undefined && allData.length >= totalCount) break;
      if (responseData.length < 100) break;
      if (response.links?.next) {
        offset += 100;
      } else {
        break;
      }

      page++;
    }

    return { data: allData, included: allIncluded };
  }

  /**
   * Single GET request (non-paginated).
   */
  async get<T = any>(url: string, params?: Record<string, any>): Promise<PcoApiResponse<T>> {
    return this.rateLimitedGet<T>(url, params);
  }

  /**
   * Validate the connection by fetching org info.
   */
  async validateConnection(): Promise<{ valid: boolean; orgName?: string; error?: string }> {
    try {
      const response = await this.rateLimitedGet("/people/v2");
      const orgName = (response as any)?.data?.attributes?.name;
      return { valid: true, orgName: orgName || undefined };
    } catch (error: any) {
      if (error.response?.status === 401) {
        return { valid: false, error: "Token expired or invalid. Please reconnect." };
      }
      return { valid: false, error: error.message || "Failed to connect to Planning Center." };
    }
  }
}

/**
 * Create a PCO client from stored tokens.
 * Returns null if no valid token is available.
 */
export async function createAuthenticatedPcoClient(): Promise<PcoClient | null> {
  console.log("[PCO] Creating authenticated client...");
  const token = await getValidAccessToken();
  if (!token) {
    console.error("[PCO] No valid access token available");
    return null;
  }
  console.log(`[PCO] Got token: ${token.substring(0, 20)}...`);
  return new PcoClient(token);
}

// ============================================================
// Proactive Token Refresh (Background Job)
// ============================================================

let tokenRefreshInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start a background interval that proactively refreshes the PCO token
 * every 90 minutes. This prevents the token from expiring between syncs
 * or when the dashboard isn't actively being used.
 *
 * PCO access tokens expire every 2 hours (7200s). By refreshing every 90 min,
 * we ensure the token is always fresh and the connection never drops.
 */
export function startProactiveTokenRefresh(): void {
  if (tokenRefreshInterval) {
    console.log("[PCO] Proactive token refresh already running");
    return;
  }

  const REFRESH_INTERVAL_MS = 90 * 60 * 1000; // 90 minutes

  // Do an immediate refresh on startup (in case token expired while server was down)
  setTimeout(async () => {
    console.log("[PCO] Running startup token refresh check...");
    const token = await getValidAccessToken();
    if (token) {
      console.log("[PCO] Startup token refresh: connection active");
    } else {
      console.warn("[PCO] Startup token refresh: no valid token (may need manual reconnect)");
    }
  }, 5000); // 5 second delay to let DB connect first

  tokenRefreshInterval = setInterval(async () => {
    try {
      console.log("[PCO] Proactive token refresh running...");
      const token = await getValidAccessToken();
      if (token) {
        console.log("[PCO] Proactive refresh: token is valid");
      } else {
        console.warn("[PCO] Proactive refresh: token refresh failed");
      }
    } catch (err: any) {
      console.error("[PCO] Proactive refresh error:", err.message);
    }
  }, REFRESH_INTERVAL_MS);

  console.log(`[PCO] Proactive token refresh started (every 90 minutes)`);
}

/**
 * Stop the proactive token refresh background job.
 */
export function stopProactiveTokenRefresh(): void {
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = null;
    console.log("[PCO] Proactive token refresh stopped");
  }
}
