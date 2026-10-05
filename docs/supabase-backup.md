# Supabase バックアップ / 本番→ローカル同期 / 復元

## 定期バックアップ（自動）

`scripts/backup/supabase_periodic_backup.ps1` を taskbox の `drain.ps1` が毎 run の終了時に呼ぶ（`Invoke-MonocoreDbBackup`。2026-08-30 導入）。保存先は `backups/auto/<timestamp>/{schema.sql,data.sql}`、保持 30 日で超過分は自動削除。結果は `backups/auto/backup-status.json` と `taskbox/drain.log` で確認する。失敗した回だけ `/drain` 板の run カードに「monocore DBバックアップ」の error 行が出る（2026-10-05〜。それまでは板に出さず、taskbox の queue に調査タスクを積んでいた）。Docker も WSL も使わず Windows ネイティブの `pg_dump.exe`（PostgreSQL 17 以上。`C:\Program Files\PostgreSQL\<メジャー>\bin`）で取る理由・資格情報を永続化しない仕組みは、スクリプト冒頭のコメントが正。`pg_dump.exe` が無い・動かないと `pgdump_missing` で失敗する（自動導入はしない）。エラー文は `LC_MESSAGES=C` で英語に固定している（日本語ロケールだと CP932 で出て、ログ・調査タスクで文字化けするため）。失敗した回の `backups/auto/<日時>/` には `FAILED.txt` が入る（タイムアウト等で不完全なダンプが残りうるので、復元に使わない）。

導入前の手動バックアップは 2026-08-11 が最後で、2026-08-29 の inbox 空文字上書きでは以後の追記を取り戻せなかった。手動取得は以下の手順で引き続き使える。

## 本番 → ローカル同期（推奨）

本番から schema + data を取得し、ローカルへ適用し、次の2点を検証するワンショットスクリプト:

1. **実行前後で本番データが変わっていない**（`public.*` + `auth.users` / `auth.identities` の指紋）
2. **ローカルがリモートと一致している**（同じ指紋スコープ）

### 前提

- ローカル Supabase が起動済み（`npx supabase start`）
- プロジェクトが link 済み（`npx supabase link`）
- Docker Desktop が利用可能
- Windows では Git Bash（または下記 `.ps1`）

### 実行

リポジトリルートで:

```powershell
.\scripts\backup\supabase_sync_prod_to_local.ps1
```

Git Bash / WSL:

```bash
./scripts/backup/supabase_sync_prod_to_local.sh
```

成果物は `backups/manual/YYYYMMDD-HHMMSS/`（`schema.sql` / `data.dump` / 指紋ファイル / ログ）。`backups/` は Git 追跡外。

検証スコープ外（ローカル Supabase イメージとの列差分・権限差のため restore 対象外）: `auth.custom_oauth_providers`、一部 `storage.*`、`vault.secrets`、`*.schema_migrations`。

**スキーマ前提:** ローカルのマイグレーション適用後スキーマが本番と一致していること。一致しない場合は restore 前に停止する（先に `db push` 等で揃える）。

---

## 個別手順（手動）

### 前提

- `pg_dump` がインストール済み、または Docker の `postgres` イメージが使える
- Supabase の Connect 画面から Session pooler URI を取得済み、または `supabase link` 済み
- 接続 URL はリポジトリ内のファイルへ保存しない

### ダンプの作成

以下は WSL または Git Bash で実行する。

```bash
export PROD_DB_URL='postgresql://...'
export BACKUP_RUN_DIR="./backups/manual/$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "${BACKUP_RUN_DIR}"

pg_dump \
  --dbname="${PROD_DB_URL}" \
  --schema-only \
  > "${BACKUP_RUN_DIR}/schema.sql"

pg_dump \
  --dbname="${PROD_DB_URL}" \
  --data-only \
  --format=custom \
  --compress=1 \
  > "${BACKUP_RUN_DIR}/data.dump"

test -s "${BACKUP_RUN_DIR}/schema.sql"
test -s "${BACKUP_RUN_DIR}/data.dump"
unset PROD_DB_URL
```

生成した `schema.sql` と `data.dump` はリポジトリ外の安全な場所へ保管する。`backups/` は Git の追跡対象外であり、リポジトリ内に置いたファイルはコミットされない。

### ローカル Supabase への復元

通常は、リポジトリのマイグレーションでスキーマを再現してからデータだけを復元する。

```bash
npx supabase db reset
export BACKUP_RUN_DIR='/mnt/c/Users/あなた/path/to/YYYYMMDD-HHMMSS'
export RESTORE_DATA_ONLY='1'
./scripts/backup/supabase_restore_local.sh
```

Git Bash では `/c/Users/...`、WSL では `/mnt/c/Users/...` を使う。必要に応じて接続先を変更する。

```bash
export LOCAL_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
```

マイグレーションが `goals` 等を seed している場合は、restore 前に `TRUNCATE ... CASCADE` が必要（同期スクリプトは public 全テーブルを truncate する）。

空の PostgreSQL へスキーマも含めて復元する場合だけ、`RESTORE_DATA_ONLY` を設定せず実行する。

```bash
unset RESTORE_DATA_ONLY
./scripts/backup/supabase_restore_local.sh
```

このモードを既存のローカル Supabase に対して使うと、`auth` などの既存スキーマと衝突する可能性がある。

---

## 部分的な復元

### inbox の直前の内容

`inboxes` は UPDATE 直前の `content` を `inbox_revisions` に退避している（直近 50 件。migration `20260830010000`）。空保存などで消えた直前の値は次で取り戻せる:

```sql
SELECT content FROM inbox_revisions WHERE user_id = '<uuid>' ORDER BY revised_at DESC LIMIT 1;
```

`schedule_day_revisions` は名前が似ているが楽観ロック用のカウンタで、過去の内容は持たない。他のテーブルで「過去の値を読み返したい」要求が出たときの雛形は `record_inbox_revision()` トリガーの方。

### バックアップが無いとき — dead tuple からの復元

誤って DELETE した行は、**VACUUM が走る前なら** `pageinspect` で dead tuple の生バイトを読んで全項目を原値のまま復元できる（2026-07-17 に schedules 2 行で実施）。

1. まだ VACUUM が走っていないことを確認する（`pg_stat_user_tables` の `last_vacuum` / `last_autovacuum` が空、`n_dead_tup > 0`）。走ると物理的に消えるので、気づいたら即座にやる。
2. `CREATE EXTENSION pageinspect;`（superuser 必須。ローカルなら `supabase_admin`）。
3. `heap_page_item_attrs(get_raw_page('<table>', <blkno>), '<table>'::regclass)` で全ページを走査し、`t_xmax <> 0`（削除済み）のタプルを拾う。`t_xmax` は削除したトランザクション ID なので、自分の事故の xid だけを対象にできる。`xid` 型は順序演算子が無いので `ORDER BY t_xmax::text`。
4. 属性のバイト列を物理表現に従って復号する: `uuid` は 16 バイト raw を 8-4-4-4-12 で区切る / `text` の varlena 短形式は先頭 1 バイトが `(全長<<1)|1` で以降が UTF-8 本体 / `timestamptz` は 8 バイト little-endian int64 = 2000-01-01 00:00:00 UTC からのマイクロ秒。
5. 復号値で INSERT し直す（`id` / `created_at` も原値で戻せる）。後から `ALTER TABLE ADD COLUMN ... DEFAULT` で足した列は fast default のため古いタプルに物理的に存在せず空で返るので、DEFAULT 値で復元する。
6. `DROP EXTENSION pageinspect;`

復元の成否は事故前に取った指紋（件数 + `md5(string_agg(id::text, ',' ORDER BY id))`）との一致で機械的に判定できる。破壊的操作の前に指紋を取る規則は `docs/database.md` §5。
