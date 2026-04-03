import { describe, it, expect, vi, beforeEach } from "vitest";

import { createMockLocals } from "../../helpers";

// 共通モック
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockGetAccessToken = vi.fn();
vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getAccessToken: (...args: unknown[]) => mockGetAccessToken(...args),
  };
});

const mockVerifyUserGuildPermission = vi.fn();
vi.mock("@/lib/discord", () => ({
  verifyUserGuildPermission: (...args: unknown[]) => mockVerifyUserGuildPermission(...args),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockRedis = {
  exists: vi.fn(),
  get: vi.fn(),
  setex: vi.fn(),
};
vi.mock("@/lib/redis", () => ({
  redis: mockRedis,
}));

describe("API: /api/guilds/[guildId]/channels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, resetAt: 0 });
    mockGetAccessToken.mockResolvedValue("valid-access-token");
    mockVerifyUserGuildPermission.mockResolvedValue(true);
    mockRedis.exists.mockResolvedValue(1);
  });

  describe("GET", () => {
    async function callGET(guildId: string = "123456789012345678", locals = createMockLocals()) {
      const { GET } = await import("@/pages/api/guilds/[guildId]/channels");
      return GET({
        params: { guildId },
        locals,
      } as any);
    }

    it("未認証の場合 401 を返す", async () => {
      const response = await callGET(
        "123456789012345678",
        createMockLocals({ authenticated: false }),
      );
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("レート制限に達した場合 429 を返す", async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, resetAt: Date.now() / 1000 + 60 });

      const response = await callGET();
      expect(response.status).toBe(429);
    });

    it("アクセストークンが無効の場合 401 を返す", async () => {
      mockGetAccessToken.mockResolvedValue(null);

      const response = await callGET();
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe("TOKEN_EXPIRED");
    });

    it("ギルド権限がない場合 403 を返す", async () => {
      mockVerifyUserGuildPermission.mockResolvedValue(false);

      const response = await callGET();
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("Bot が未参加の場合 404 を返す", async () => {
      mockRedis.exists.mockResolvedValue(0);

      const response = await callGET();
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("BOT_NOT_JOINED_OR_OFFLINE");
    });

    it("チャンネルキャッシュがない場合は空配列を返す", async () => {
      mockRedis.get.mockResolvedValue(null);

      const response = await callGET();
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.channels).toEqual([]);
      expect(body.data.cached).toBe(false);
    });

    it("チャンネルキャッシュが存在する場合はチャンネル一覧を返す", async () => {
      const channels = [
        { id: "ch1", name: "general", type: 0 },
        { id: "ch2", name: "bot-commands", type: 0 },
      ];
      mockRedis.get.mockResolvedValue(JSON.stringify(channels));

      const response = await callGET();
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.channels).toEqual(channels);
      expect(body.data.cached).toBe(true);
    });

    it("チャンネルキャッシュが不正な JSON の場合は空配列を返す", async () => {
      mockRedis.get.mockResolvedValue("invalid-json{{{");

      const response = await callGET();
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.channels).toEqual([]);
      expect(body.data.cached).toBe(false);
    });
  });

  describe("POST", () => {
    async function callPOST(guildId: string = "123456789012345678", locals = createMockLocals()) {
      const { POST } = await import("@/pages/api/guilds/[guildId]/channels");
      return POST({
        params: { guildId },
        locals,
      } as any);
    }

    it("未認証の場合 401 を返す", async () => {
      const response = await callPOST(
        "123456789012345678",
        createMockLocals({ authenticated: false }),
      );
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("レート制限に達した場合 429 を返す", async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, resetAt: Date.now() / 1000 + 60 });

      const response = await callPOST();
      expect(response.status).toBe(429);
    });

    it("権限がない場合 403 を返す", async () => {
      mockVerifyUserGuildPermission.mockResolvedValue(false);

      const response = await callPOST();
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("Bot が未参加の場合 404 を返す", async () => {
      mockRedis.exists.mockResolvedValue(0);

      const response = await callPOST();
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("BOT_NOT_JOINED_OR_OFFLINE");
    });

    it("正常なリクエストでリフレッシュキーを設定する", async () => {
      mockRedis.setex.mockResolvedValue("OK");

      const response = await callPOST();
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);

      // Redis にリフレッシュキーが設定されたことを検証
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "app:guild:123456789012345678:channels:refresh",
        60,
        "1",
      );
    });
  });
});
