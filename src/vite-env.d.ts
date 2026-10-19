/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the offline map storage (catalog.json + region files). */
  readonly VITE_MAPS_BASE_URL?: string;
}
