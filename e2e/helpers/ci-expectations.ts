/** Status HTTP aceites em CI com credenciais Supabase placeholder. */
export const unauthenticatedApiStatuses = [401, 403, 400] as const;

export const publicTrackInvalidTokenStatuses = [400, 404, 500] as const;

export const ciSkipsSsrPlaywrightMocks =
  Boolean(process.env.CI) && process.env.PLAYWRIGHT_STAGING !== "1";
