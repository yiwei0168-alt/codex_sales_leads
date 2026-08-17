export const OWNER_USER_ID = "00000000-0000-4000-8000-000000000001";
export const SESSION_COOKIE = "network_copilot_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function isAuthConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD_HASH?.trim());
}
