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

const mockDbSelect = vi.fn();
const mockDb = {
  select: mockDbSelect,
};
vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/db/schema", () => ({
  configAuditLogs: {
    id: "id",
    guildId: "guild_id",
    userId: "user_id",
    username: "username",
    action: "action",
    oldVersion: "old_version",
    newVersion: "new_version",
    changes: "changes",
    createdAt: "created_at",
  },
  users: {
    id: "id",
    username: "username",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ column: _col, value: val })),
  desc: vi.fn((col: unknown) => ({ column: col, direction: "desc" })),
}));

describe("API: /api/guilds/[guildId]/audit-logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, resetAt: 0 });
    mockGetAccessToken.mockResolvedValue("valid-access-token");
    mockVerifyUserGuildPermission.mockResolvedValue(true);
  });

  async function callGET(
    guildId: string = "123456789012345678",
    queryParams: Record<string, string> = {},
    locals = createMockLocals()
  ) {
    const url = new URL(`http://localhost/api/guilds/${guildId}/audit-logs`);
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }

    const { GET } = await import("@/pages/api/guilds/[guildId]/audit-logs");
    return GET({
      params: { guildId },
      locals,
      request: new Request(url.toString()),
    } as any);
  }

  it("未認証の場合 401 を返す", async () => {
    const response = await callGET("123456789012345678", {}, createMockLocals({ authenticated: false }));
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

  it("guildId がない場合 400 を返す", async () => {
    const { GET } = await import("@/pages/api/guilds/[guildId]/audit-logs");
    const response = await GET({
      params: {},
      locals: createMockLocals(),
      request: new Request("http://localhost/api/guilds//audit-logs"),
    } as any);
    expect(response.status).toBe(400);
  });

  it("不正な limit パラメータの場合 400 を返す", async () => {
    // チェーンモック: select → from → leftJoin → where → orderBy → limit → offset
    // ただし limit < 1 のバリデーションでエラーになるはず
    const response = await callGET("123456789012345678", { limit: "0" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("負の offset パラメータの場合 400 を返す", async () => {
    const response = await callGET("123456789012345678", { offset: "-1" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("NaN の limit パラメータの場合 400 を返す", async () => {
    const response = await callGET("123456789012345678", { limit: "abc" });
    expect(response.status).toBe(400);
  });

  it("正常なリクエストで監査ログを返す", async () => {
    const mockLogs = [
      {
        id: 1,
        guildId: "123456789012345678",
        userId: "user-1",
        username: "testuser",
        action: "update",
        oldVersion: 1,
        newVersion: 2,
        changes: '{"previous":{},"current":{}}',
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    // select チェーンをモック
    const chain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue(mockLogs),
    };
    mockDbSelect.mockReturnValue(chain);

    // count 用の別チェーン
    mockDbSelect.mockReturnValueOnce(chain).mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      }),
    });

    const response = await callGET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.logs).toHaveLength(1);
    expect(body.data.logs[0].changes).toEqual({ previous: {}, current: {} });
    expect(body.data.pagination).toBeDefined();
  });
});
