# Supabase 手動バックアップ / 本番→ローカル同期

当面、バックアップは必要なタイミングで手動取得する。定期実行、世代管理、Raspberry Pi への保存は行わない。

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
