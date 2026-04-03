import type { APIRoute } from "astro";
import { eq, desc } from "drizzle-orm";
import { createApiResponse, createApiError, getAccessToken } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { configAuditLogs, users } from "@/lib/db/schema";
import { verifyUserGuildPermission } from "@/lib/discord";
import { createLogger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const logger = createLogger("AuditLogsAPI");

/**
 * GET /api/guilds/:guildId/audit-logs
 * 監査ログ一覧を取得
 */
export const GET: APIRoute = async ({ params, request, locals }) => {
  const guildId = params.guildId;
  if (!guildId) {
    return createApiError("MISSING_GUILD_ID", "Guild ID is required", 400);
  }

  const { user, session } = locals;
  if (!user || !session) {
    return createApiError("UNAUTHORIZED", "ログインが必要です", 401);
  }

  // レート制限チェック（ユーザーごと: 10req/10sec）
  const rateLimitResult = await checkRateLimit(`user:${user.id}:audit:read`, 10, 10);
  if (!rateLimitResult.allowed) {
    return createApiError("RATE_LIMIT_EXCEEDED", "リクエストが多すぎます。しばらくお待ちください。", 429);
  }

  // 認可チェック: ユーザーがこのギルドの管理権限を持っているか検証
  const accessToken = await getAccessToken(session.id);
  if (!accessToken) {
    return createApiError("TOKEN_EXPIRED", "セッションの有効期限が切れました。再ログインしてください。", 401);
  }

  const hasPermission = await verifyUserGuildPermission(accessToken, guildId, user.id);
  if (!hasPermission) {
    return createApiError("FORBIDDEN", "このサーバーの監査ログを閲覧する権限がありません", 403);
  }

  try {
    // URL パラメータからページネーション情報を取得
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    // バリデーション: NaN または負の値を拒否
    if (Number.isNaN(limit) || limit < 1) {
      return createApiError("INVALID_REQUEST", "limit は 1 以上の整数である必要があります", 400);
    }
    if (Number.isNaN(offset) || offset < 0) {
      return createApiError("INVALID_REQUEST", "offset は 0 以上の整数である必要があります", 400);
    }

    logger.info("Fetching audit logs", {
      guildId,
      userId: user.id,
      limit,
      offset,
    });

    // 監査ログを取得（ユーザー情報も JOIN）
    const logs = await db
      .select({
        id: configAuditLogs.id,
        guildId: configAuditLogs.guildId,
        userId: configAuditLogs.userId,
        username: users.username,
        action: configAuditLogs.action,
        oldVersion: configAuditLogs.oldVersion,
        newVersion: configAuditLogs.newVersion,
        changes: configAuditLogs.changes,
        createdAt: configAuditLogs.createdAt,
      })
      .from(configAuditLogs)
      .leftJoin(users, eq(configAuditLogs.userId, users.id))
      .where(eq(configAuditLogs.guildId, guildId))
      .orderBy(desc(configAuditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    // 総件数を取得
    const countResult = await db
      .select({ count: configAuditLogs.id })
      .from(configAuditLogs)
      .where(eq(configAuditLogs.guildId, guildId));

    const total = countResult.length;

    logger.info("Audit logs fetched successfully", {
      guildId,
      count: logs.length,
      total,
    });

    return createApiResponse({
      logs: logs.map((log) => ({
        ...log,
        changes: JSON.parse(log.changes),
      })),
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (err) {
    logger.error("Failed to fetch audit logs", {
      guildId,
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });

    return createApiError("INTERNAL_ERROR", "Failed to fetch audit logs", 500);
  }
};
