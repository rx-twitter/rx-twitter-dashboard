/**
 * Dashboard 用構造化ロガー
 *
 * Bot側のwinstonロガーに倣った実装だが、Dashboard（Astro SSR）環境では
 * ファイル出力をシンプルにするため、winston-daily-rotate-fileは使わない。
 * 代わりに標準のwinstonのみを使用し、Dockerログとして出力する。
 */

import winston from "winston";

// ログレベル
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// コンソール用フォーマット（色付き）
const consoleFormat = winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
  const contextStr = context ? `[${context}]` : "";
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${timestamp} [${level}] ${contextStr} ${message}${metaStr}`;
});

// JSON フォーマット（ファイル出力・構造化ログ用）
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// トランスポート設定
// 本番: JSON形式1本（Docker logs で収集・解析しやすい）
// 開発: 人間可読の色付きフォーマット1本
const transports: winston.transport[] = [
  process.env.NODE_ENV === "production"
    ? new winston.transports.Console({ format: jsonFormat })
    : new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
          winston.format((info) => {
            info.level = info.level.toUpperCase();
            return info;
          })(),
          winston.format.colorize(),
          consoleFormat,
        ),
      }),
];

// Logger インスタンス作成
const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports,
  // エラー発生時に例外をスローしない（ロギング失敗でアプリを止めない）
  exitOnError: false,
});

// ヘルパー関数（context付きロギング）
export const createLogger = (context: string) => ({
  info: (message: string, meta?: Record<string, unknown>) =>
    logger.info(message, { context, ...meta }),
  warn: (message: string, meta?: Record<string, unknown>) =>
    logger.warn(message, { context, ...meta }),
  error: (message: string, meta?: Record<string, unknown>) =>
    logger.error(message, { context, ...meta }),
  debug: (message: string, meta?: Record<string, unknown>) =>
    logger.debug(message, { context, ...meta }),
});

export default logger;
