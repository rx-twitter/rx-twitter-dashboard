import path from "path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      NODE_ENV: "test",
      // crypto.ts の起動時チェックを通すための最低限の環境変数
      ENCRYPTION_SALT: "test-salt-minimum-16chars",
      SESSION_SECRET: "test-session-secret-minimum-32-characters-long!!",
      DISCORD_OAUTH2_CLIENT_ID: "test-client-id",
      DISCORD_OAUTH2_CLIENT_SECRET: "test-client-secret",
      DISCORD_OAUTH2_REDIRECT_URI: "http://localhost:4321/api/auth/discord/callback",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["node_modules/", "dist/", "**/*.test.ts", "**/*.spec.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Dashboard は単体リポジトリとして CI が動くため @twitterrx/shared が存在しない。
      // テスト時はローカルのスタブ（src/lib/constants.ts）を使用する。
      // 値は packages/shared/src/constants.ts と必ず一致させること。
      "@twitterrx/shared": path.resolve(__dirname, "./src/lib/constants.ts"),
    },
  },
});
