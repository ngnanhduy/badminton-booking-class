/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL. Default `/api/v1` (proxied by the dev server). */
  readonly VITE_API_URL?: string
  /** "true" → in-memory sample data, no backend. */
  readonly VITE_DEMO?: string
  /** Club / class name shown in the header and page titles. */
  readonly VITE_CLUB_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
