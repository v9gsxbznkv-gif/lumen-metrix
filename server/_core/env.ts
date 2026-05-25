export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Planning Center Online API credentials
  pcoAppId: process.env.PCO_APP_ID ?? "",
  pcoSecret: process.env.PCO_SECRET ?? "",
  pcoRedirectUri: process.env.PCO_REDIRECT_URI ?? "https://churchdash-emzmxpmc.manus.space/api/pco/callback",
  // Resend email API
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  // Dashboard password gate
  dashboardPassword: process.env.DASHBOARD_PASSWORD ?? "Test123",
};
