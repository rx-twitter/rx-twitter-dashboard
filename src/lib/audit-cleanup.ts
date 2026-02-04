import { lt } from "drizzle-orm";
import { db } from "./db";
import { configAuditLogs } from "./db/schema";
import { createLogger } from "./logger";

const logger = createLogger("AuditLogCleanup");

/**
 * P2: 監査ログ保持期間（デフォルト180日）
 * 環境変数 AUDIT_LOG_RETENTION_DAYS で変更可能
 * 0を設定すると無制限（削除しない）
 */
const AUDIT_LOG_RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || "180", 10);

/**
 * P2: 古い監査ログをクリーンアップ
 * 保持期間を超えたログを削除
 */
export async function cleanupOldAuditLogs(): Promise<number> {
  // 保持期間が0の場合は無制限（削除しない）
  if (AUDIT_LOG_RETENTION_DAYS === 0) {
    logger.info("Retention is unlimited, skipping cleanup");
    return 0;
  }

  const retentionDate = new Date();
  retentionDate.setDate(retentionDate.getDate() - AUDIT_LOG_RETENTION_DAYS);

  logger.info(`Cleaning up logs older than ${retentionDate.toISOString()}`, {
    retentionDays: AUDIT_LOG_RETENTION_DAYS,
  });

  try {
    const result = await db.delete(configAuditLogs).where(lt(configAuditLogs.createdAt, retentionDate.toISOString()));

    const deletedCount = result.changes || 0;

    if (deletedCount > 0) {
      logger.info(`Deleted ${deletedCount} old audit logs`);
    } else {
      logger.info("No old audit logs to delete");
    }

    return deletedCount;
  } catch (err) {
    logger.error("Error during cleanup", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * P2: 監査ログクリーンアップジョブを開始
 * 毎日1回実行（深夜2時）
 */
export function startAuditLogCleanupJob(): void {
  // 次の実行時刻を計算（深夜2時）
  const getNextRun = () => {
    const now = new Date();
    const next = new Date();
    next.setHours(2, 0, 0, 0);

    if (now >= next) {
      // 今日の2時を過ぎていたら明日の2時
      next.setDate(next.getDate() + 1);
    }

    return next.getTime() - now.getTime();
  };

  const scheduleNext = () => {
    const delay = getNextRun();
    logger.info(`Next cleanup scheduled in ${Math.floor(delay / 1000 / 60 / 60)} hours`);

    setTimeout(async () => {
      try {
        await cleanupOldAuditLogs();
      } catch (err) {
        logger.error("Job failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // 次回の実行をスケジュール
      scheduleNext();
    }, delay);
  };

  scheduleNext();
  logger.info(`Cleanup job started (retention: ${AUDIT_LOG_RETENTION_DAYS} days)`);
}
