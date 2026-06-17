/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAT_COOLDOWN_SECONDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
