// サーバー起動前にミドルウェアモジュールを読み込み、初期化処理（Redis書き込み等）を実行する。
// Astro の @astrojs/node (standalone) は middleware を遅延ロードするため、
// リクエスト前に initializeApp() を確実に実行するにはこのラッパーが必要。
await import("./dist/server/_astro-internal_middleware.mjs");

// Astro サーバーを起動
await import("./dist/server/entry.mjs");
