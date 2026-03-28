import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createApiResponse,
  createApiError,
  createRateLimitError,
  createNotFoundError,
  createBotNotJoinedError,
  createApiResponseWithHeaders,
} from "@/lib/api-helpers";

describe("api-helpers", () => {
  describe("createApiResponse", () => {
    it("正常なレスポンスを生成する", async () => {
      const data = { key: "value" };
      const response = createApiResponse(data);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ success: true, data: { key: "value" } });
    });

    it("カスタムステータスコードを設定できる", async () => {
      const response = createApiResponse({ created: true }, 201);

      expect(response.status).toBe(201);
    });

    it("Content-Type が application/json である", () => {
      const response = createApiResponse({});

      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("Cache-Control: no-store がセットされている", () => {
      const response = createApiResponse({});

      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("null データも許容する", async () => {
      const response = createApiResponse(null);
      const body = await response.json();

      expect(body).toEqual({ success: true, data: null });
    });
  });

  describe("createApiError", () => {
    it("エラーレスポンスを生成する", async () => {
      const response = createApiError("TEST_ERROR", "テストエラー", 400);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({
        success: false,
        error: { code: "TEST_ERROR", message: "テストエラー" },
      });
    });

    it("デフォルトステータスコードは 400", () => {
      const response = createApiError("ERR", "msg");

      expect(response.status).toBe(400);
    });

    it("401 ステータスを指定できる", () => {
      const response = createApiError("UNAUTHORIZED", "認証が必要です", 401);

      expect(response.status).toBe(401);
    });

    it("Cache-Control: no-store がセットされている", () => {
      const response = createApiError("ERR", "msg");

      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
  });

  describe("createRateLimitError", () => {
    it("429 ステータスとRetry-Afterヘッダーを返す", async () => {
      const resetAt = Math.floor(Date.now() / 1000) + 60;
      const response = createRateLimitError(resetAt);

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBeDefined();
      expect(response.headers.get("Cache-Control")).toBe("no-store");

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    });
  });

  describe("createNotFoundError", () => {
    it("404 ステータスを返す", async () => {
      const response = createNotFoundError();

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("カスタムメッセージを指定できる", async () => {
      const response = createNotFoundError("見つかりません");

      const body = await response.json();
      expect(body.error.message).toBe("見つかりません");
    });
  });

  describe("createBotNotJoinedError", () => {
    it("404 ステータスと BOT_NOT_JOINED_OR_OFFLINE コードを返す", async () => {
      const response = createBotNotJoinedError();

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("BOT_NOT_JOINED_OR_OFFLINE");
    });
  });

  describe("createApiResponseWithHeaders", () => {
    it("カスタムヘッダーを追加できる", () => {
      const response = createApiResponseWithHeaders({}, 200, {
        ETag: '"1"',
        "X-Custom": "value",
      });

      expect(response.headers.get("ETag")).toBe('"1"');
      expect(response.headers.get("X-Custom")).toBe("value");
    });

    it("標準ヘッダーも含まれている", () => {
      const response = createApiResponseWithHeaders({}, 200, { ETag: '"1"' });

      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
  });

  describe("getAccessToken", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("セッションが存在しない場合 null を返す", async () => {
      // redis と crypto をモック
      vi.doMock("@/lib/redis", () => ({
        redis: {
          get: vi.fn().mockResolvedValue(null),
        },
      }));
      vi.doMock("@/lib/crypto", () => ({
        decryptToken: vi.fn(),
      }));

      const { getAccessToken } = await import("@/lib/api-helpers");
      const result = await getAccessToken("nonexistent-session");

      expect(result).toBeNull();
    });

    it("encryptedAccessToken が存在しない場合 null を返す", async () => {
      vi.doMock("@/lib/redis", () => ({
        redis: {
          get: vi.fn().mockResolvedValue(JSON.stringify({ userId: "u1" })),
        },
      }));
      vi.doMock("@/lib/crypto", () => ({
        decryptToken: vi.fn(),
      }));

      const { getAccessToken } = await import("@/lib/api-helpers");
      const result = await getAccessToken("session-without-token");

      expect(result).toBeNull();
    });

    it("トークンが期限切れの場合 null を返す", async () => {
      vi.doMock("@/lib/redis", () => ({
        redis: {
          get: vi.fn().mockResolvedValue(
            JSON.stringify({
              encryptedAccessToken: "encrypted",
              expiresAt: Date.now() - 10000, // 過去
            })
          ),
        },
      }));
      vi.doMock("@/lib/crypto", () => ({
        decryptToken: vi.fn(),
      }));

      const { getAccessToken } = await import("@/lib/api-helpers");
      const result = await getAccessToken("expired-session");

      expect(result).toBeNull();
    });

    it("有効なセッションからトークンを復号して返す", async () => {
      vi.doMock("@/lib/redis", () => ({
        redis: {
          get: vi.fn().mockResolvedValue(
            JSON.stringify({
              encryptedAccessToken: "encrypted-token",
              expiresAt: Date.now() + 100000, // 未来
            })
          ),
        },
      }));
      vi.doMock("@/lib/crypto", () => ({
        decryptToken: vi.fn().mockReturnValue("decrypted-access-token"),
      }));

      const { getAccessToken } = await import("@/lib/api-helpers");
      const result = await getAccessToken("valid-session");

      expect(result).toBe("decrypted-access-token");
    });
  });
});
