# Dashboard API 実装ガイド

> **この文書について**: Bot リポジトリ（[rx-twitter/rx-twitter](https://github.com/rx-twitter/rx-twitter)）の `docs/` から移した、Dashboard 設計時の文書です。実装と食い違う箇所は実装を正とします。
>
> `src/middleware/api-headers.ts` は存在しません。API の共通ヘッダーは `src/middleware.ts` と `src/lib/api-helpers.ts` で付けています。

> このドキュメントは [DASHBOARD_SPEC.md](DASHBOARD_SPEC.md) のセクション6（API 設計）から抽出した実装例を記載しています。

---

## 目次

- [共通仕様](#共通仕様)
- [エラーレスポンス](#エラーレスポンス)
- [レート制限](#レート制限)
- [認証エンドポイント](#認証エンドポイント)
- [ギルド設定エンドポイント](#ギルド設定エンドポイント)
  - [ギルド一覧取得](#ギルド一覧取得)
  - [ギルド設定取得](#ギルド設定取得)
  - [ギルド設定更新](#ギルド設定更新)
  - [チャンネル再取得リクエスト](#チャンネル再取得リクエスト)

---

## 共通仕様

### API レスポンスヘッダーの強制（P1対応）

全ての API エンドポイントで以下のヘッダーを強制します。

```typescript
// dashboard/src/middleware/api-headers.ts
// ★ P1対応: 全 API レスポンスに共通ヘッダーを付与
export function apiMiddleware({ request }: { request: Request }): Response | undefined {
  // API エンドポイントのみ対象
  if (!request.url.includes("/api/")) return;

  return undefined; // 後続処理を継続
}

// レスポンス生成時に共通ヘッダーを付与
export function createApiResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate", // ★ 全 API でキャッシュ禁止
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// エラーレスポンスにも同様のヘッダーを付与
export function createApiError(error: ApiError, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate", // ★ エラーもキャッシュ禁止
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

**理由**: 404（BOT_NOT_JOINED_OR_OFFLINE）など recoverable なエラーがキャッシュされると復旧後もエラー表示が続きます。

---

## GET 純粋取得のみ（副作用禁止）- P0対応

`GET /api/guilds/{guildId}/config` は設定の取得のみを行い、**設定が存在しない場合は 404 を返します**。自動作成はしません。

### 設計根拠

- GET に副作用があると監査ログが汚れる
- Bot 未参加状態でも設定が作られる
- 「誰がいつ作ったのか」が曖昧になる
- セキュリティレビューで確実に突っ込まれる

### 初期化 API: POST /api/guilds/{guildId}/config:initialize

```typescript
export async function POST({ params, locals }) {
  const { guildId } = params;
  const session = locals.session;

  // 権限チェック
  await validateGuildAccess(guildId, session);

  // 既に存在する場合はエラー
  const existing = await getConfig(guildId);
  if (existing) {
    throw new ConflictError({ code: "CONFIG_ALREADY_EXISTS" });
  }

  // デフォルト設定を作成（監査ログにはユーザー明示の初期化として記録）
  const config = await createDefaultConfig(guildId, session.userId, {
    trigger: "manual_initialize",
  });

  return new Response(JSON.stringify({ success: true, config }), { status: 201 });
}
```

### UI: 設定未作成時の表示

```tsx
function ConfigNotFoundView({ guildId }: { guildId: string }) {
  const [initializing, setInitializing] = useState(false);

  const handleInitialize = async () => {
    setInitializing(true);
    try {
      await fetch(`/api/guilds/${guildId}/config:initialize`, { method: "POST" });
      window.location.reload();
    } finally {
      setInitializing(false);
    }
  };

  return (
    <div className="config-not-found">
      <h2>設定が初期化されていません</h2>
      <p>このサーバーの設定はまだ作成されていません。</p>
      <p>「初期化」ボタンを押して設定を作成してください。</p>
      <button onClick={handleInitialize} disabled={initializing}>
        {initializing ? "初期化中..." : "⚙️ 設定を初期化"}
      </button>
    </div>
  );
}
```

### 互換性オプション: AUTO_CREATE_CONFIG_ON_GET

既存ユーザーのために、従来の GET 副作用動作をオプトインで有効化できます。

| 環境変数                    | デフォルト | 説明                                   |
| --------------------------- | ---------- | -------------------------------------- |
| `AUTO_CREATE_CONFIG_ON_GET` | `false`    | `true` で GET 副作用を有効化（非推奨） |

```typescript
const AUTO_CREATE_CONFIG = process.env.AUTO_CREATE_CONFIG_ON_GET === "true";

if (!config) {
  if (AUTO_CREATE_CONFIG) {
    // 非推奨: 従来の後方互換用
    console.warn("[Config] AUTO_CREATE_CONFIG_ON_GET is deprecated");
    config = await createDefaultConfig(guildId, sessionData.userId, {
      trigger: "auto_create_on_get",
    });
  } else {
    throw new NotFoundError({
      code: "CONFIG_NOT_FOUND",
      message: "設定がまだ作成されていません。設定を初期化してください。",
    });
  }
}
```

---

## エラーレスポンス

### エラーレスポンス形式

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "whitelist must not be empty when allowAllChannels is false"
  }
}
```

### 共通エラーコード

| HTTP | コード                      | 説明                                       |
| ---- | --------------------------- | ------------------------------------------ |
| 400  | `VALIDATION_ERROR`          | リクエストの検証エラー                     |
| 401  | `UNAUTHORIZED`              | 未認証                                     |
| 403  | `FORBIDDEN`                 | 権限なし                                   |
| 404  | `NOT_FOUND`                 | リソースが見つからない                     |
| 404  | `BOT_NOT_JOINED_OR_OFFLINE` | Bot 未参加 or オフライン（復旧可能性あり） |
| 409  | `CONFLICT`                  | 競合（楽観的ロック失敗）                   |
| 429  | `RATE_LIMITED`              | レート制限超過                             |
| 503  | `SERVICE_UNAVAILABLE`       | Redis 障害など一時的なエラー               |

### BOT_NOT_JOINED_OR_OFFLINE エラーの処理

**P0対応**: 404 エラーでもリトライ可能なエラーとして扱います。

```typescript
// ★ 矛盾解消: recoverable フラグを追加
throw new NotFoundError({
  code: "BOT_NOT_JOINED_OR_OFFLINE",
  message: "Bot がこのギルドに参加していないか、Bot がオフラインの可能性があります",
  recoverable: true, // ★ 追加: フロントでのリトライ判定に使用
  hint: "Bot が起動しているか確認してください。起動直後の場合は数秒お待ちください。",
});
```

### フロントエンドでの処理（P0対応）

```typescript
if (response.status === 404) {
  // ★ P1対応: content-type を確認してから JSON パース
  // SSR ルーティングミスや nginx エラーページで HTML が返る場合がある
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    // JSON ではない 404（SSR ルーティングエラー等）
    showGenericNotFoundError();
    return;
  }

  const data = await response.json();
  if (data.error?.code === "BOT_NOT_JOINED_OR_OFFLINE") {
    // ★ 復旧可能性があるエラー → リトライ導線を表示
    showRecoverableError(data.error);
  } else {
    // 通常の 404（リソースが存在しない）
    showNotFoundError();
  }
}
```

### リトライ導線の表示

```tsx
function BotOfflineError({ hint }: { hint?: string }) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    // 数秒待ってからリトライ
    await new Promise((r) => setTimeout(r, 3000));
    window.location.reload();
  };

  return (
    <div className="error-banner recoverable">
      <p>Bot がこのサーバーに参加していないか、オフラインの可能性があります。</p>
      {/* ★ P0対応: Bot 起動直後の問い合わせ削減のための文言 */}
      <p className="startup-notice">⏳ Bot 起動直後の場合、数秒後に再試行してください。</p>
      {hint && <p className="hint">{hint}</p>}
      <button onClick={handleRetry} disabled={retrying}>
        {retrying ? "確認中..." : "🔄 数秒後に再試行"}
      </button>
    </div>
  );
}
```

---

## レート制限

### レート制限設定

| エンドポイント                     | 制限 | 単位           |
| ---------------------------------- | ---- | -------------- |
| `PUT /api/guilds/{guildId}/config` | 10回 | 1分 / ユーザー |
| `GET /api/guilds`                  | 30回 | 1分 / ユーザー |
| `POST /api/auth/*`                 | 5回  | 1分 / IP       |

### Lua スクリプトによる原子的実装（P0対応）

```lua
// ★ P0対応: Lua スクリプトによる原子的なレート制限
// KEYS[1] = レート制限キー
// ARGV[1] = 現在時刻（ミリ秒）
// ARGV[2] = ウィンドウ開始時刻（ミリ秒）
// ARGV[3] = 制限回数
// ARGV[4] = ウィンドウ秒数
// ARGV[5] = ユニークメンバー（${now}-${uuid}）
const RATE_LIMIT_SCRIPT = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local windowStart = tonumber(ARGV[2])
  local limit = tonumber(ARGV[3])
  local windowSeconds = tonumber(ARGV[4])
  local member = ARGV[5]

  -- 古いエントリを削除
  redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

  -- 現在のカウント
  local count = redis.call('ZCARD', key)

  -- ★ P1対応: resetAt の計算を統一（最古エントリのスコア + window）
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt = now + (windowSeconds * 1000)
  if #oldest >= 2 then
    resetAt = tonumber(oldest[2]) + (windowSeconds * 1000)
  end

  if count >= limit then
    -- 制限超過
    return { 0, 0, resetAt }  -- allowed=false
  end

  -- リクエストを記録
  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, windowSeconds)

  -- ★ P1対応: allowed 時も resetAt を統一して返す
  return { 1, limit - count - 1, resetAt }  -- allowed=true
`;
```

### レート制限チェック実装

```typescript
import { randomUUID } from "crypto";

// Redis を使用したレート制限（Lua スクリプトで原子的に実行）
async function checkRateLimit(
  key: string, // 例: 'ratelimit:user:{userId}:PUT:/api/guilds'
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const member = `${now}-${randomUUID()}`;

  // ★ Lua スクリプトで原子的に実行（競合状態を防止）
  const result = (await redis.eval(
    RATE_LIMIT_SCRIPT,
    1, // KEYS の数
    key, // KEYS[1]
    now, // ARGV[1]
    windowStart, // ARGV[2]
    limit, // ARGV[3]
    windowSeconds, // ARGV[4]
    member, // ARGV[5]
  )) as [number, number, number];

  const [allowed, remaining, resetAt] = result;
  return { allowed: allowed === 1, remaining, resetAt };
}
```

### Fixed Window + INCR（未認証向け、P1対応）

```typescript
// Fixed Window（シンプル版）- 未認証エンドポイント向け
async function checkRateLimitFixedWindow(
  key: string, // 例: 'ratelimit:ip:{ip}:auth'
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowKey = `${key}:${Math.floor(now / (windowSeconds * 1000))}`;

  // INCR は原子的なのでレースコンディションなし
  const count = await redis.incr(windowKey);
  if (count === 1) {
    await redis.expire(windowKey, windowSeconds);
  }

  const allowed = count <= limit;
  const resetAt = (Math.floor(now / (windowSeconds * 1000)) + 1) * windowSeconds * 1000;

  return { allowed, remaining: Math.max(0, limit - count), resetAt };
}
```

### レスポンスヘッダー

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1736553600
```

---

## 認証エンドポイント

実装例は [DASHBOARD_AUTH_IMPLEMENTATION.md](DASHBOARD_AUTH_IMPLEMENTATION.md) を参照してください。

---

## ギルド設定エンドポイント

### ギルド一覧取得

```
GET /api/guilds
```

**認可**: 要ログイン

**Response**:

```json
{
  "guilds": [
    {
      "id": "123456789",
      "name": "My Server",
      "icon": "abc123",
      "hasManagePermission": true,
      "botJoined": true
    }
  ]
}
```

**`botJoined` の判定方法**:

- Dashboard は Bot トークンを持たない（セキュリティ上の理由）
- **Redis の `app:guild:{guildId}:joined` キーの存在で判定**（TTL なし）
- Bot が `guildCreate` イベントでキーを作成、`guildDelete` イベントで削除

### ギルド設定取得

```
GET /api/guilds/{guildId}/config
```

**認可**: 要ログイン + `MANAGE_GUILD` 権限

**Response Headers**:

- `ETag: "3"` (現在の version)
- `Cache-Control: no-store`

**Response Body**:

```json
{
  "guildId": "123456789",
  "allowAllChannels": false,
  "whitelist": ["111111111", "222222222"],
  "version": 3,
  "availableChannels": [
    { "id": "111111111", "name": "general", "type": 0 },
    { "id": "222222222", "name": "bot-commands", "type": 0 }
  ],
  "pagination": {
    "total": 50,
    "limit": 100,
    "offset": 0
  }
}
```

### ギルド設定更新

```
PUT /api/guilds/{guildId}/config
```

**認可**: 要ログイン + `MANAGE_GUILD` 権限

**Headers**:

- `X-CSRF-Token: {csrfToken}` (必須)
- `If-Match: "{version}"` (楽観的ロック)

**Request Body**:

```json
{
  "allowAllChannels": false,
  "whitelist": ["111111111", "222222222"]
}
```

#### If-Match 形式の厳格化（P1対応）

```typescript
function parseIfMatch(header: string | null): number | null {
  if (!header) return null;

  // 厳密に `"${number}"` 形式のみ許可
  const match = header.match(/^"(\d+)"$/);
  if (!match) {
    throw new BadRequestError({
      code: "INVALID_IF_MATCH",
      message: 'If-Match ヘッダーは "version" 形式（例: "3"）で指定してください',
    });
  }

  return parseInt(match[1], 10);
}
```

#### 処理フロー（トランザクション）

```sql
BEGIN TRANSACTION;

-- 1. 現在の設定を取得（監査ログ用）
SELECT * FROM guild_configs WHERE guild_id = ?;

-- 2. 監査ログ記録
INSERT INTO config_audit_logs (...) VALUES (...);

-- 3. 既存 whitelist を削除
DELETE FROM channel_whitelist WHERE guild_id = ?;

-- 4. 新しい whitelist を挿入（100件ずつバッチ処理）
INSERT INTO channel_whitelist (guild_id, channel_id) VALUES (?, ?), ...;

-- 5. guild_configs を更新（★ P0対応: WHERE に version を含めて競合検出）
UPDATE guild_configs
SET allow_all_channels = ?, version = version + 1, updated_at = ?
WHERE guild_id = ? AND version = ?;
-- ↑ affected rows が 0 なら 409 CONFLICT を返す

COMMIT;
```

#### 楽観ロックの正しい実装（P0対応）

```typescript
// Drizzle ORM での実装例
const result = await tx
  .update(guildConfigs)
  .set({
    allowAllChannels: data.allowAllChannels,
    version: sql`version + 1`,
    updatedAt: now.toISOString(),
  })
  .where(
    and(
      eq(guildConfigs.guildId, guildId),
      eq(guildConfigs.version, expectedVersion), // ★ P0対応: version を WHERE に含める
    ),
  );

// affected rows で競合検出
if (result.changes === 0) {
  // version が一致しなかった = 競合発生
  throw new ConflictError({
    code: "CONFLICT",
    message: "設定が他のユーザーによって更新されました。再読み込みしてください。",
  }); // 409
}
```

#### Redis 更新（リトライ付き）

```typescript
// トランザクション成功後、Redis 更新（リトライ付き）
async function updateRedisWithRetry(
  guildId: string,
  config: RedisConfig,
  maxRetries: number = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // ★ TTL なしで永続保存
      await redis.set(`app:guild:${guildId}:config`, JSON.stringify(config));
      await redis.publish(
        "app:config:update",
        JSON.stringify({
          guildId,
          version: config.version,
        }),
      );
      return; // 成功
    } catch (err) {
      console.error(`[Redis] Update failed (attempt ${attempt}/${maxRetries}):`, err);
      if (attempt === maxRetries) {
        throw err; // リトライ上限に達した
      }
      // 指数バックオフでリトライ（100ms, 200ms, 400ms）
      await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
    }
  }
}
```

#### 503 エラー時の UX 改善（P0対応）

```typescript
try {
  await db.transaction(async (tx) => {
    // SQLite トランザクション...
  });

  // ★ SQLite 成功後、Redis 更新（ここが失敗したら API 全体を失敗扱い）
  await updateRedisWithRetry(guildId, {
    guildId,
    allowAllChannels,
    whitelist,
    version: newVersion,
    updatedAt: new Date().toISOString(),
  });

  return { success: true, version: newVersion };
} catch (err) {
  if (err instanceof RedisError || err.message?.includes("Redis")) {
    // Redis 障害時は 503 Service Unavailable
    // ★ P0対応: 「保存自体は完了した可能性」と現在 version を返す
    const currentConfig = await db.query.guildConfigs.findFirst({
      where: eq(guildConfigs.guildId, guildId),
    });

    return new Response(
      JSON.stringify({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "設定の同期に失敗しました。保存は完了している可能性があります。",
          // ★ P0対応: 現在の version を返すことで、再試行時の 409 を防止
          currentVersion: currentConfig?.version ?? null,
          hint: "ページを再読み込みして、現在の設定を確認してください。",
        },
      }),
      { status: 503 },
    );
  }
  throw err;
}
```

#### UI 側の 503 対応

```tsx
// 503 エラー時の UI 対応
async function handleSaveError(response: Response, guildId: string) {
  if (response.status === 503) {
    const data = await response.json();
    // ★ 503 時は自動で最新の設定を取得し直す
    const latestConfig = await fetchConfig(guildId);
    setVersion(latestConfig.version);
    setWhitelist(new Set(latestConfig.whitelist));
    setAllowAll(latestConfig.allowAllChannels);

    // ユーザーに通知（★ 結果整合モデルに対応した文言）
    setError(
      "保存は完了している可能性があります。最新の状態を表示しました。再読み込みして確認してください。",
    );
  }
}
```

### チャンネル再取得リクエスト

Dashboard から Bot へ「チャンネル一覧を再取得してほしい」という意思表示を可能にします。

```
POST /api/guilds/{guildId}/channels/refresh
```

**認可**: 要ログイン + `MANAGE_GUILD` 権限

**処理フロー**:

```typescript
// Dashboard 側: 再取得リクエスト
async function requestChannelRefresh(guildId: string): Promise<void> {
  await redis.setex(`app:guild:${guildId}:channels:refresh`, 60, "1");
}
```

Bot 側の実装は [DASHBOARD_BOT_IMPLEMENTATION.md](DASHBOARD_BOT_IMPLEMENTATION.md) を参照してください。

---

## 関連ドキュメント

- [DASHBOARD_SPEC.md](DASHBOARD_SPEC.md) - メイン仕様書
- [DASHBOARD_AUTH_IMPLEMENTATION.md](DASHBOARD_AUTH_IMPLEMENTATION.md) - 認証・認可実装
- [DASHBOARD_BOT_IMPLEMENTATION.md](DASHBOARD_BOT_IMPLEMENTATION.md) - Bot 側実装
- [DASHBOARD_DEPLOYMENT.md](DASHBOARD_DEPLOYMENT.md) - デプロイ・運用ガイド
