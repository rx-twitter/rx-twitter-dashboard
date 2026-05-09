#!/bin/sh
# dashboard/scripts/migrate.sh
#
# Drizzle マイグレーションを実行する起動スクリプト。
#
# 【背景】
# このプロジェクトは drizzle/ をリポジトリで管理する前に稼働開始した本番 DB が存在する。
# そのような既存 DB には __drizzle_migrations テーブルが存在せず、
# drizzle-kit migrate を実行すると 0000 の CREATE TABLE が "already exists" で失敗する。
# そのため、0000 を適用済みとして登録してから再実行するリトライ処理を行う。
#
# 【0000 の hash について】
# drizzle-orm は _journal.json の各エントリに対応する SQL ファイルを読み込み、
# その内容の SHA256 を hash として __drizzle_migrations に記録する。
# ここでは 0000_even_bullseye.sql をランタイムで読み込んで hash を算出する。

set -e

echo "Running database migrations..."
mkdir -p ./data

npm run db:migrate > /tmp/migrate.log 2>&1 && {
  cat /tmp/migrate.log
  echo "Migrations completed successfully"
  exit 0
}

cat /tmp/migrate.log

# "already exists" エラー = 既存 DB に __drizzle_migrations が未登録の状態
if ! grep -q "already exists" /tmp/migrate.log; then
  echo "Migration failed with unexpected error"
  exit 1
fi

echo "Existing DB detected. Registering 0000 into __drizzle_migrations and retrying..."

node -e "
  const crypto = require('crypto');
  const fs = require('fs');
  const Database = require('better-sqlite3');

  const journal = JSON.parse(fs.readFileSync('./drizzle/meta/_journal.json', 'utf8'));
  const db = new Database('./data/dashboard.db');

  db.exec(\`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at NUMERIC
  )\`);

  for (const entry of journal.entries) {
    const sql = fs.readFileSync('./drizzle/' + entry.tag + '.sql', 'utf8');
    const hash = crypto.createHash('sha256').update(sql).digest('hex');
    const exists = db.prepare('SELECT 1 FROM __drizzle_migrations WHERE hash = ?').get(hash);
    if (!exists) {
      db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(hash, entry.when);
      console.log('Registered: ' + entry.tag + ' (' + hash.slice(0, 8) + '...)');
    } else {
      console.log('Already registered: ' + entry.tag);
    }
  }

  db.close();
"

npm run db:migrate > /tmp/migrate2.log 2>&1 && {
  cat /tmp/migrate2.log
  echo "Migrations completed successfully"
  exit 0
}

cat /tmp/migrate2.log
echo "Migration failed on retry"
exit 1
