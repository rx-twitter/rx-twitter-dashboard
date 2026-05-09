#!/bin/sh
# dashboard/scripts/migrate.sh

echo "Running database migrations..."

# データディレクトリを確実に作成
mkdir -p ./data

# データベースファイルが存在して、既にマイグレーションテーブルが存在するか確認
if [ -f "./data/dashboard.db" ]; then
  # sqlite3でマイグレーションテーブルの存在を確認
  if command -v sqlite3 > /dev/null 2>&1; then
    TABLE_EXISTS=$(sqlite3 ./data/dashboard.db "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations';" 2>/dev/null || echo "")
    if [ -n "$TABLE_EXISTS" ]; then
      echo "Database and migration tracking table already exist, attempting migration anyway..."
    fi
  fi
fi

# Drizzle ORMのマイグレーションを実行
# パイプを使わず終了コードを確実に取得する
npm run db:migrate > /tmp/migrate.log 2>&1
MIGRATE_EXIT=$?
cat /tmp/migrate.log

if [ "$MIGRATE_EXIT" -eq 0 ]; then
  echo "Migrations completed successfully"
else
  # エラーログに「already exists」が含まれている場合:
  # 既存DBに __drizzle_migrations が未登録の可能性があるため、
  # 0000 を適用済みとして登録してから再実行する
  if grep -q "already exists" /tmp/migrate.log; then
    echo "Tables already exist. Seeding __drizzle_migrations with 0000 and retrying..."
    node -e "
      const Database = require('better-sqlite3');
      const db = new Database('./data/dashboard.db');
      db.exec(\`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL,
        created_at NUMERIC
      )\`);
      const exists = db.prepare(
        \"SELECT 1 FROM __drizzle_migrations WHERE hash = '0000_even_bullseye'\"
      ).get();
      if (!exists) {
        db.prepare(
          \"INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('0000_even_bullseye', ?)\"
        ).run(Date.now());
        console.log('Inserted 0000_even_bullseye into __drizzle_migrations');
      } else {
        console.log('0000_even_bullseye already recorded');
      }
      db.close();
    "
    npm run db:migrate > /tmp/migrate2.log 2>&1
    MIGRATE_EXIT2=$?
    cat /tmp/migrate2.log
    if [ "$MIGRATE_EXIT2" -eq 0 ]; then
      echo "Migrations completed successfully (retry)"
    else
      echo "Migration failed on retry"
      exit 1
    fi
  else
    echo "Migration failed with unexpected error"
    exit 1
  fi
fi
