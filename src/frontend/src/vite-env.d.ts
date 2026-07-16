/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "full" (default — talks to the FastAPI backend) or "cdn" (static, no backend). */
  readonly VITE_DEPLOYMENT_MODE?: "full" | "cdn";
  /** Dev-only mock opt-out (see lib/mocks.ts). */
  readonly VITE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
