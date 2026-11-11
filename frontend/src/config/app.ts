const env = import.meta.env

/** Runtime configuration, read from `VITE_*` environment variables. */
export const appConfig = {
  /**
   * Base URL of the backend API. Defaults to `/api/v1`, which the Vite dev server proxies to
   * the backend (see vite.config.ts). In production, serve the API on the same domain or set
   * the full URL, e.g. https://api.example.com/api/v1.
   */
  apiUrl: (env.VITE_API_URL?.trim() || '/api/v1').replace(/\/+$/, ''),
  /** Demo mode: in-memory mock API with sample data, no backend needed. */
  demoMode: env.VITE_DEMO === 'true',
  /** Club name; empty = the translated default ("Lớp Cầu Lông" / "Badminton Class"). */
  clubName: env.VITE_CLUB_NAME?.trim() ?? '',
  requestTimeoutMs: 20_000,
  storageKeys: {
    zaloName: 'badminton:zalo-name',
    colorScheme: 'badminton:color-scheme',
  },
} as const
