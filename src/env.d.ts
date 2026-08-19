/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_MAP_STYLE_URL?: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_CONTACT_EMAIL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
