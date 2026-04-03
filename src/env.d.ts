// oxlint-disable-next-line typescript-eslint/triple-slash-reference -- Astro が必須とする triple-slash reference
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import("./lib/auth").User | null;
    session: import("./lib/auth").Session | null;
    url: URL;
  }
}
