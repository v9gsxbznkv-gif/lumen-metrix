import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Start the nightly auto-sync scheduler (midnight Eastern)
  try {
    const { startAutoSyncScheduler } = await import("../pco/scheduler");
    startAutoSyncScheduler();
  } catch (err) {
    console.warn("[Server] Could not start auto-sync scheduler:", err);
  }
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // PCO OAuth callback (authorization code exchange)
  app.get("/api/pco/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code) {
        return res.status(400).send("Missing authorization code from Planning Center.");
      }

      // Use the fixed registered redirect URI from environment
      const { ENV } = await import("../_core/env");
      const redirectUri = ENV.pcoRedirectUri;

      // Dynamic import to avoid circular deps
      const { exchangeCodeForTokens, storeTokens, PcoClient } = await import("../pco/client");
      const tokens = await exchangeCodeForTokens(code, redirectUri);

      // Fetch org info
      let orgName: string | undefined;
      let orgId: string | undefined;
      try {
        const client = new PcoClient(tokens.accessToken);
        const validation = await client.validateConnection();
        orgName = validation.orgName;
      } catch {}

      await storeTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        scope: tokens.scope,
        organizationName: orgName,
        organizationId: orgId,
      });

      // Redirect back to settings page with success indicator
      res.redirect(`/?tab=settings&pco=connected`);
    } catch (err: any) {
      console.error("[PCO OAuth Callback] Error:", err.message);
      res.redirect(`/?tab=settings&pco=error&message=${encodeURIComponent(err.message)}`);
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
