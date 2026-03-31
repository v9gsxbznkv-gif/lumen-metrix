/**
 * Planning Center Online API Client
 * Uses OAuth 2.0 Bearer tokens with automatic refresh.
 */
import axios, { AxiosInstance, AxiosError } from "axios";
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
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
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
 */
export async function getValidAccessToken(): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select().from(pcoTokens).limit(1);
  if (rows.length === 0) return null;

  const token = rows[0];

  // Check if token is expired (with 5-minute buffer)
  const bufferMs = 5 * 60 * 1000;
  if (token.expiresAt && new Date(token.expiresAt).getTime() - bufferMs < Date.now()) {
    console.log("[PCO] Access token expired, refreshing...");
    try {
      const refreshed = await refreshAccessToken(token.refreshToken);
      await storeTokens({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresIn: refreshed.expiresIn,
      });
      console.log("[PCO] Token refreshed successfully");
      return refreshed.accessToken;
    } catch (err: any) {
      console.error("[PCO] Token refresh failed:", err.message);
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

  return {
    connected: true,
    organizationName: rows[0].organizationName || undefined,
    expiresAt: rows[0].expiresAt || undefined,
    scope: rows[0].scope || undefined,
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
    this.client = axios.create({
      baseURL: PCO_BASE_URL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  /**
   * Rate-limited GET request with auto-retry on 401 (token refresh).
   */
  private async rateLimitedGet<T = any>(url: string, params?: Record<string, any>): Promise<PcoApiResponse<T>> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS - elapsed));
    }
    this.lastRequestTime = Date.now();

    try {
      console.log(`[PCO API] GET ${url}`, params ? JSON.stringify(params) : '');
      const response = await this.client.get(url, { params });
      return response.data;
    } catch (error: any) {
      console.error(`[PCO API] Error on GET ${url}:`, error.response?.status, error.message);
      // If 401, try refreshing the token once
      if (error.response?.status === 401) {
        console.log("[PCO] Got 401, attempting token refresh...");
        const newToken = await getValidAccessToken();
        if (newToken && newToken !== this.accessToken) {
          this.accessToken = newToken;
          this.client.defaults.headers.Authorization = `Bearer ${newToken}`;
          const response = await this.client.get(url, { params });
          return response.data;
        }
      }
      throw error;
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
