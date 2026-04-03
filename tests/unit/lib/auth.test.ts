import { describe, it, expect, vi, beforeEach } from "vitest";

import { generateSessionId, getSessionCookieAttributes } from "@/lib/auth";

// Redis と DB をモック（モジュールレベルの副作用を回避）
vi.mock("@/lib/redis", () => ({
  redis: {
    setex: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(null),
        }),
      }),
    }),
  },
}));

describe("auth", () => {
  describe("generateSessionId", () => {
    it("文字列を返す", () => {
      const id = generateSessionId();
      expect(typeof id).toBe("string");
    });

    it("空文字ではない", () => {
      const id = generateSessionId();
      expect(id.length).toBeGreaterThan(0);
    });

    it("毎回異なるIDが生成される", () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateSessionId()));
      expect(ids.size).toBe(100);
    });
  });

  describe("getSessionCookieAttributes", () => {
    it("デフォルトでセキュアな属性が返される", () => {
      const attrs = getSessionCookieAttributes();

      expect(attrs.httpOnly).toBe(true);
      expect(attrs.secure).toBe(true);
      expect(attrs.sameSite).toBe("lax");
      expect(attrs.path).toBe("/");
      expect(attrs.maxAge).toBeGreaterThan(0);
    });

    it("secure: false を指定できる", () => {
      const attrs = getSessionCookieAttributes(false);

      expect(attrs.secure).toBe(false);
      expect(attrs.httpOnly).toBe(true);
      expect(attrs.sameSite).toBe("lax");
    });

    it("maxAge が 7 日間（秒）である", () => {
      const attrs = getSessionCookieAttributes();
      const SEVEN_DAYS = 7 * 24 * 60 * 60;

      expect(attrs.maxAge).toBe(SEVEN_DAYS);
    });
  });

  describe("createSession", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("セッションを作成して Redis に保存する", async () => {
      const { redis } = await import("@/lib/redis");
      const { createSession } = await import("@/lib/auth");

      const session = await createSession("user-123", "encrypted-token", 3600);

      expect(session.id).toBeDefined();
      expect(session.userId).toBe("user-123");
      expect(session.encryptedAccessToken).toBe("encrypted-token");
      expect(session.expiresAt).toBeGreaterThan(Date.now());
      expect(redis.setex).toHaveBeenCalledWith(
        `lucia:session:${session.id}`,
        expect.any(Number),
        expect.any(String),
      );
    });
  });

  describe("validateSession", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("セッションが存在しない場合 null を返す", async () => {
      const { redis } = await import("@/lib/redis");
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const { validateSession } = await import("@/lib/auth");
      const result = await validateSession("nonexistent");

      expect(result).toBeNull();
    });

    it("期限切れのセッションは null を返す", async () => {
      const { redis } = await import("@/lib/redis");
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify({
          id: "session-1",
          userId: "user-1",
          encryptedAccessToken: "token",
          expiresAt: Date.now() - 10000, // 過去
        }),
      );

      const { validateSession } = await import("@/lib/auth");
      const result = await validateSession("session-1");

      expect(result).toBeNull();
      // 期限切れセッションは削除される
      expect(redis.del).toHaveBeenCalledWith("lucia:session:session-1");
    });
  });

  describe("invalidateSession", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("Redis からセッションを削除する", async () => {
      const { redis } = await import("@/lib/redis");
      const { invalidateSession } = await import("@/lib/auth");

      await invalidateSession("session-to-delete");

      expect(redis.del).toHaveBeenCalledWith("lucia:session:session-to-delete");
    });
  });
});
