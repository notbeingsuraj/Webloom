/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SITE_URL?: string;
  readonly VITE_PUBLIC_ANALYTICS_DOMAIN?: string;
  readonly VITE_PUBLIC_ANALYTICS_SRC?: string;
  readonly VITE_PUBLIC_ANALYTICS_CONSENT_REQUIRED?: string;
  readonly VITE_PUBLIC_CONTACT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}