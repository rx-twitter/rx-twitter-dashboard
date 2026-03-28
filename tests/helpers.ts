import type { User, Session } from "@/lib/auth";

/**
 * テスト用のモックユーザー
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-123",
    discordId: "discord-456",
    username: "testuser",
    avatar: "avatar-hash",
    ...overrides,
  };
}

/**
 * テスト用のモックセッション
 */
export function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-abc",
    userId: "user-123",
    encryptedAccessToken: "encrypted-token",
    expiresAt: Date.now() + 3600000,
    ...overrides,
  };
}

/**
 * テスト用の locals オブジェクト
 */
export function createMockLocals(options: { authenticated?: boolean } = {}) {
  const { authenticated = true } = options;
  if (!authenticated) {
    return { user: null, session: null };
  }
  return {
    user: createMockUser(),
    session: createMockSession(),
  };
}
