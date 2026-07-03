/// <reference types="vite/client" />

import type { RefForgeApi } from '../../preload';

declare global {
  interface Window {
    refForge: RefForgeApi;
  }
}

export {};
