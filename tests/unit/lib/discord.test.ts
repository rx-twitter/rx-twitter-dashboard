import { describe, it, expect, vi, beforeEach } from "vitest";

// fetch をモック
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// discord モジュール内の process.exit を防ぐ（環境変数は vitest.config.ts で設定済み）
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("discord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDiscordUser", () => {
    it("アクセストークンでユーザー情報を取得する", async () => {
      const mockUser = { id: "123", username: "testuser", avatar: "abc" };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockUser),
      });

      const { getDiscordUser } = await import("@/lib/discord");
      const user = await getDiscordUser("test-token");

      expect(user).toEqual(mockUser);
      expect(mockFetch).toHaveBeenCalledWith("https://discord.com/api/users/@me", {
        headers: { Authorization: "Bearer test-token" },
      });
    });

    it("API エラー時に例外をスローする", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const { getDiscordUser } = await import("@/lib/discord");

      await expect(getDiscordUser("invalid-token")).rejects.toThrow("Failed to fetch user: 401");
    });
  });

  describe("getDiscordGuilds", () => {
    it("ギルド一覧を取得する", async () => {
      const mockGuilds = [{ id: "g1", name: "Guild 1", icon: null, owner: true, permissions: "2147483647" }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockGuilds),
      });

      const { getDiscordGuilds } = await import("@/lib/discord");
      const guilds = await getDiscordGuilds("test-token");

      expect(guilds).toEqual(mockGuilds);
      expect(mockFetch).toHaveBeenCalledWith("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: "Bearer test-token" },
      });
    });

    it("API エラー時に例外をスローする", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
      });

      const { getDiscordGuilds } = await import("@/lib/discord");

      await expect(getDiscordGuilds("bad-token")).rejects.toThrow("Failed to fetch guilds: 403");
    });
  });

  describe("verifyUserGuildPermission", () => {
    it("MANAGE_GUILD 権限を持つユーザーは true を返す", async () => {
      const MANAGE_GUILD = 0x20;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: "guild-1", name: "Test", icon: null, owner: false, permissions: String(MANAGE_GUILD) },
          ]),
      });

      const { verifyUserGuildPermission } = await import("@/lib/discord");
      const result = await verifyUserGuildPermission("token", "guild-1");

      expect(result).toBe(true);
    });

    it("ADMINISTRATOR 権限を持つユーザーは true を返す", async () => {
      const ADMINISTRATOR = 0x8;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: "guild-1", name: "Test", icon: null, owner: false, permissions: String(ADMINISTRATOR) },
          ]),
      });

      const { verifyUserGuildPermission } = await import("@/lib/discord");
      const result = await verifyUserGuildPermission("token", "guild-1");

      expect(result).toBe(true);
    });

    it("権限がないユーザーは false を返す", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: "guild-1", name: "Test", icon: null, owner: false, permissions: "0" }]),
      });

      const { verifyUserGuildPermission } = await import("@/lib/discord");
      const result = await verifyUserGuildPermission("token", "guild-1");

      expect(result).toBe(false);
    });

    it("ギルドに参加していない場合 false を返す", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const { verifyUserGuildPermission } = await import("@/lib/discord");
      const result = await verifyUserGuildPermission("token", "nonexistent-guild");

      expect(result).toBe(false);
    });

    it("API エラー時は false を返す（例外をスローしない）", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const { verifyUserGuildPermission } = await import("@/lib/discord");
      const result = await verifyUserGuildPermission("token", "guild-1");

      expect(result).toBe(false);
    });

    it("MANAGE_GUILD + 他の権限の複合ビットでも true を返す", async () => {
      // MANAGE_GUILD (0x20) | SEND_MESSAGES (0x800) = 0x820
      const permissions = (0x20 | 0x800).toString();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: "guild-1", name: "Test", icon: null, owner: false, permissions }]),
      });

      const { verifyUserGuildPermission } = await import("@/lib/discord");
      const result = await verifyUserGuildPermission("token", "guild-1");

      expect(result).toBe(true);
    });
  });
});
