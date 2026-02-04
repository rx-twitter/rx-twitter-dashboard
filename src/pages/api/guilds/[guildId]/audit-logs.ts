import type { APIRoute } from "astro";
import { eq, desc } from "drizzle-orm";
import { createApiResponse, createApiError } from "@/lib/api-helpers";
import { validateSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { configAuditLogs, users } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("AuditLogsAPI");

/**
 * GET /api/guilds/:guildId/audit-logs
 * 監査ログ一覧を取得
 */
export const GET: APIRoute = async ({ params, request, cookies }) => {
  const guildId = params.guildId;
  if (!guildId) {
    return createApiError("MISSING_GUILD_ID", "Guild ID is required", 400);
  }

  // セッション検証
  const sessionId = cookies.get("auth_session")?.value;
  if (!sessionId) {
    return createApiError("UNAUTHORIZED", "Not logged in", 401);
  }

  const sessionResult = await validateSession(sessionId);
  if (!sessionResult || !sessionResult.session || !sessionResult.user) {
    return createApiError("UNAUTHORIZED", "Session expired", 401);
  }

  try {
    // URL パラメータからページネーション情報を取得
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    logger.info("Fetching audit logs", {
      guildId,
      userId: sessionResult.user.id,
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
      userId: sessionResult.user.id,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    return createApiError("INTERNAL_ERROR", "Failed to fetch audit logs", 500);
  }
};
