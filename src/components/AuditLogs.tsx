import { type FunctionComponent } from "preact";
import { useState, useEffect } from "preact/hooks";

interface AuditLogEntry {
  id: number;
  guildId: string;
  userId: string;
  username: string | null;
  action: string;
  oldVersion: number | null;
  newVersion: number;
  changes: {
    allowAllChannels?: {
      old: boolean;
      new: boolean;
    };
    whitelist?: {
      added: string[];
      removed: string[];
    };
  };
  createdAt: string;
}

interface AuditLogsProps {
  guildId: string;
}

export const AuditLogs: FunctionComponent<AuditLogsProps> = ({ guildId }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);

  const fetchLogs = async (offset: number) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/guilds/${guildId}/audit-logs?limit=${limit}&offset=${offset}`);

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = "/api/auth/discord/login";
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setLogs(data.logs);
      setTotal(data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page * limit);
  }, [page, guildId, limit]);

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  };

  const formatAction = (action: string) => {
    switch (action) {
      case "create":
        return "作成";
      case "update":
        return "更新";
      case "create_default":
        return "デフォルト作成";
      case "manual_initialize":
        return "手動初期化";
      default:
        return action;
    }
  };

  const renderChanges = (entry: AuditLogEntry) => {
    const changes: string[] = [];

    if (entry.changes.allowAllChannels) {
      const { old: oldVal, new: newVal } = entry.changes.allowAllChannels;
      changes.push(`全チャンネル許可: ${oldVal ? "ON" : "OFF"} → ${newVal ? "ON" : "OFF"}`);
    }

    if (entry.changes.whitelist) {
      const { added, removed } = entry.changes.whitelist;
      if (added.length > 0) {
        changes.push(`追加: ${added.length}件`);
      }
      if (removed.length > 0) {
        changes.push(`削除: ${removed.length}件`);
      }
    }

    return changes.length > 0 ? changes.join(", ") : "変更なし";
  };

  const totalPages = Math.ceil(total / limit);

  if (loading && logs.length === 0) {
    return (
      <div class="audit-logs-loading">
        <p>読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div class="audit-logs-error">
        <p>エラーが発生しました: {error}</p>
        <button onClick={() => fetchLogs(page * limit)}>再試行</button>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div class="audit-logs-empty">
        <p>まだ監査ログはありません。</p>
      </div>
    );
  }

  return (
    <div class="audit-logs">
      <div class="audit-logs-header">
        <h2>変更履歴</h2>
        <p class="audit-logs-count">全 {total} 件の変更記録があります。</p>
      </div>

      <div class="audit-logs-table-wrapper">
        <table class="audit-logs-table">
          <thead>
            <tr>
              <th>日時</th>
              <th>操作</th>
              <th>変更内容</th>
              <th>変更者</th>
              <th>バージョン</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((entry) => (
              <tr key={entry.id}>
                <td class="audit-log-date">{formatDate(entry.createdAt)}</td>
                <td class="audit-log-action">{formatAction(entry.action)}</td>
                <td class="audit-log-changes">{renderChanges(entry)}</td>
                <td class="audit-log-user">{entry.username || `User ${entry.userId}`}</td>
                <td class="audit-log-version">
                  {entry.oldVersion !== null ? `v${entry.oldVersion} → v${entry.newVersion}` : `v${entry.newVersion}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div class="audit-logs-pagination">
          <button
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            class="pagination-btn"
          >
            前へ
          </button>
          <span class="pagination-info">
            {page + 1} / {totalPages} ページ
          </span>
          <button
            disabled={page >= totalPages - 1 || loading}
            onClick={() => setPage((p) => p + 1)}
            class="pagination-btn"
          >
            次へ
          </button>
        </div>
      )}

      <style>{`
        .audit-logs {
          margin-top: 2rem;
          padding: 1.5rem;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .audit-logs-header {
          margin-bottom: 1.5rem;
        }

        .audit-logs-header h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
          color: #333;
        }

        .audit-logs-count {
          margin: 0;
          font-size: 0.9rem;
          color: #666;
        }

        .audit-logs-table-wrapper {
          overflow-x: auto;
          background: white;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .audit-logs-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 600px;
        }

        .audit-logs-table thead {
          background: #f1f3f5;
        }

        .audit-logs-table th {
          padding: 0.75rem 1rem;
          text-align: left;
          font-weight: 600;
          color: #495057;
          border-bottom: 2px solid #dee2e6;
        }

        .audit-logs-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #e9ecef;
        }

        .audit-logs-table tbody tr:hover {
          background: #f8f9fa;
        }

        .audit-log-date {
          white-space: nowrap;
          font-size: 0.9rem;
          color: #6c757d;
        }

        .audit-log-action {
          font-weight: 500;
          color: #495057;
        }

        .audit-log-changes {
          color: #495057;
        }

        .audit-log-user {
          color: #6c757d;
        }

        .audit-log-version {
          font-family: monospace;
          font-size: 0.9rem;
          color: #6c757d;
        }

        .audit-logs-pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          margin-top: 1.5rem;
        }

        .pagination-btn {
          padding: 0.5rem 1rem;
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .pagination-btn:hover:not(:disabled) {
          background: #f8f9fa;
          border-color: #adb5bd;
        }

        .pagination-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pagination-info {
          font-size: 0.9rem;
          color: #6c757d;
        }

        .audit-logs-loading,
        .audit-logs-error,
        .audit-logs-empty {
          padding: 2rem;
          text-align: center;
          color: #6c757d;
        }

        .audit-logs-error button {
          margin-top: 1rem;
          padding: 0.5rem 1rem;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .audit-logs-error button:hover {
          background: #0056b3;
        }
      `}</style>
    </div>
  );
};
