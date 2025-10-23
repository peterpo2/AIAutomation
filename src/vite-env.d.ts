/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_DROPBOX_APP_KEY?: string;
  readonly VITE_DROPBOX_APP_SECRET?: string;
  readonly VITE_DROPBOX_REFRESH_TOKEN?: string;
  readonly VITE_DROPBOX_REDIRECT_URI?: string;
  readonly DROPBOX_APP_KEY?: string;
  readonly DROPBOX_APP_SECRET?: string;
  readonly DROPBOX_REFRESH_TOKEN?: string;
  readonly DROPBOX_REDIRECT_URI?: string;
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
