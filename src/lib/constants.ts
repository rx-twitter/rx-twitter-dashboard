/**
 * Dashboard ローカル定数 テスト用スタブ
 *
 * Bot 側の @twitterrx/shared と同じ値を維持すること。
 * Dashboard は単体リポジトリとして CI が動くため、shared パッケージを直接 import できない。
 */

/** メッセージあたりの URL 処理数デフォルト値（Bot 側 DEFAULT_MAX_URLS_PER_MESSAGE と一致させること） */
export const DEFAULT_MAX_URLS_PER_MESSAGE = 3;

/** メッセージあたりの URL 処理数上限（Bot 側 MAX_URLS_PER_MESSAGE_LIMIT と一致させること） */
export const MAX_URLS_PER_MESSAGE_LIMIT = 5;
