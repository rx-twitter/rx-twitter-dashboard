# TwitterRX Dashboard

Discord Bot（TwitterRX）のギルド設定・チャンネルホワイトリストを管理する Web ダッシュボードです。

## 技術スタック

| カテゴリ       | 技術                                  |
| -------------- | ------------------------------------- |
| フレームワーク | Astro v4（SSR モード + Node adapter） |
| UI             | Preact                                |
| データベース   | SQLite（better-sqlite3）+ Drizzle ORM |
| セッション／KV | Redis（ioredis）                      |
| 認証           | Discord OAuth2（arctic）              |
| 暗号化         | AES-256-GCM（Node.js crypto）         |
| テスト         | Vitest v4                             |
| Lint／Format   | oxlint・oxfmt                         |
| ランタイム     | Node.js 24（Docker: node:24-alpine）  |

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env` ファイルを作成します:

```bash
cp .env.example .env
```

#### 必須

| 変数名                         | 説明                                               |
| ------------------------------ | -------------------------------------------------- |
| `DISCORD_OAUTH2_CLIENT_ID`     | Discord Developer Portal で取得                    |
| `DISCORD_OAUTH2_CLIENT_SECRET` | Discord Developer Portal で取得                    |
| `DISCORD_OAUTH2_REDIRECT_URI`  | `https://yourdomain.com/api/auth/discord/callback` |
| `SESSION_SECRET`               | 32 文字以上。`openssl rand -base64 32` で生成      |
| `ENCRYPTION_SALT`              | 16 文字以上。`openssl rand -base64 32` で生成      |

#### オプション

| 変数名                         | デフォルト値               | 説明                    |
| ------------------------------ | -------------------------- | ----------------------- |
| `DATABASE_URL`                 | `file:./data/dashboard.db` | SQLite データベースパス |
| `REDIS_URL`                    | `redis://redis:6379`       | Redis 接続 URL          |
| `ORPHAN_CONFIG_RETENTION_DAYS` | `30`                       | 孤立設定の保持日数      |
| `AUDIT_LOG_RETENTION_DAYS`     | `90`                       | 監査ログの保持日数      |

### 3. データベースマイグレーション

```bash
npm run db:generate
npm run db:migrate
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

http://localhost:4321 でアクセスできます。

## npm スクリプト

| コマンド                | 説明                         |
| ----------------------- | ---------------------------- |
| `npm run dev`           | 開発サーバー起動             |
| `npm run build`         | 型チェック + 本番ビルド      |
| `npm run preview`       | ビルド成果物のプレビュー     |
| `npm run test`          | テスト実行（Vitest）         |
| `npm run test:watch`    | テスト監視モード             |
| `npm run test:coverage` | カバレッジ付きテスト実行     |
| `npm run lint`          | Lint 実行（oxlint）          |
| `npm run lint:fix`      | Lint 自動修正                |
| `npm run format`        | フォーマット（oxfmt）        |
| `npm run format:check`  | フォーマットチェック         |
| `npm run db:generate`   | Drizzle マイグレーション生成 |
| `npm run db:migrate`    | マイグレーション適用         |
| `npm run db:studio`     | Drizzle Studio 起動          |

## Docker での実行

このプロジェクトは workspace monorepo の一部として Docker ビルドされます。

```bash
docker build -t twitterrx-dashboard .
docker run -p 4321:4321 \
  -v dashboard_data:/app/dashboard/data \
  --env-file .env \
  twitterrx-dashboard
```

起動時に `scripts/migrate.sh` が自動実行され、データベースマイグレーションが適用されます。

## 機能

- ✅ Discord OAuth2 認証（arctic）
- ✅ CSRF 保護（Redis + timing-safe 検証）
- ✅ レート制限（Lua スクリプトで原子化）
- ✅ トークン暗号化（AES-256-GCM + scrypt 鍵派生）
- ✅ セッション管理（Redis、7 日間 TTL）
- ✅ SQLite データベース（Drizzle ORM）
- ✅ ギルド設定・チャンネルホワイトリスト管理
- ✅ 監査ログ（設定変更の記録・閲覧）
- ✅ Redis 再シード処理（起動時に SQLite → Redis 復元）
- ✅ セキュリティヘッダー（X-Content-Type-Options, X-Frame-Options 等）

## API エンドポイント

| エンドポイント                     | メソッド    | 説明                    |
| ---------------------------------- | ----------- | ----------------------- |
| `/api/auth/discord/login`          | GET         | Discord OAuth2 ログイン |
| `/api/auth/discord/callback`       | GET         | OAuth2 コールバック     |
| `/api/auth/logout`                 | POST        | ログアウト              |
| `/api/guilds`                      | GET         | ギルド一覧取得          |
| `/api/guilds/[guildId]/config`     | GET / PATCH | ギルド設定の取得・更新  |
| `/api/guilds/[guildId]/channels`   | GET         | チャンネル一覧取得      |
| `/api/guilds/[guildId]/audit-logs` | GET         | 監査ログ取得            |

## ページ

| パス                          | 説明                               |
| ----------------------------- | ---------------------------------- |
| `/`                           | ランディングページ（未ログイン時） |
| `/dashboard`                  | ダッシュボード（ギルド選択）       |
| `/dashboard/guilds/[guildId]` | ギルド設定画面                     |
| `/auth/session-expired`       | セッション期限切れ画面             |
