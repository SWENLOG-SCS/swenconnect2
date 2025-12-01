// Manually define Vite env types to resolve 'vite/client' not found and ImportMeta errors
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
  [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
