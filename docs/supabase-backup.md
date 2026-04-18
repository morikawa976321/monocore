# Supabase Production Backup (Linux Minimal)

この手順は、`Raspberry Pi Zero 2 W` などの Linux マシンで、本番 Supabase のバックアップを毎日取得してローカル保存し、必要時にローカル Supabase へ復元するための最小運用です。

## 1. 目的

- 本番 DB の `globals.sql` / `schema.sql` / `data.dump` を定期取得する
- 取得物を世代管理し、復元可能な素材を残す

## 2. 前提

- Linux マシンで `bash` が使える
- `pg_dump`, `pg_dumpall` がインストール済み
- 本番 Supabase の接続 URL を保持している（`PROD_DB_URL`）
- このリポジトリを Linux マシンに配置済み

## 3. スクリプト

- バックアップ本体: `scripts/backup/supabase_backup.sh`
- ローカル復元: `scripts/backup/supabase_restore_local.sh`（`schema.sql` + `data.dump` のみ）
- Raspberry Pi 初期セットアップ: `scripts/backup/raspi_setup.sh`
- Raspberry Pi 事前検証: `scripts/backup/raspi_preflight.sh`
- cron 登録: `scripts/backup/install_backup_cron.sh`
- 環境変数テンプレート: `scripts/backup/backup.env.example`

環境変数:

- 必須
  - `PROD_DB_URL`: 本番 DB の接続 URL
- 任意
  - `BACKUP_DIR`: 保存先（既定 `/srv/backups/supabase`）
  - `KEEP_GENERATIONS`: 保持世代数（既定 `10`）
  - `DUMP_COMPRESSION`: `data.dump` の圧縮レベル（既定 `1`）
  - `PG_CLIENT_MODE`: `auto | local | docker`（既定 `auto`）
  - `PG_DOCKER_IMAGE`: dockerモードで使うイメージ（既定 `postgres:17-alpine`）

`PG_CLIENT_MODE=auto` のときは以下で自動選択します。

1. `pg_dump` / `pg_dumpall` がローカルにあれば `local`
2. なければ `docker`

## 4. 初期セットアップ

最短で準備する場合（推奨）:

```bash
cd /path/to/monocore
./scripts/backup/raspi_setup.sh
cp scripts/backup/backup.env.example scripts/backup/backup.env
# scripts/backup/backup.env を編集
./scripts/backup/raspi_preflight.sh
./scripts/backup/install_backup_cron.sh
```

手動で個別に実施する場合:

```bash
cd /path/to/monocore
chmod +x scripts/backup/supabase_backup.sh
chmod +x scripts/backup/supabase_restore_local.sh
chmod +x scripts/backup/raspi_setup.sh
chmod +x scripts/backup/raspi_preflight.sh
chmod +x scripts/backup/install_backup_cron.sh
sudo mkdir -p /srv/backups/supabase
sudo chown -R "$USER":"$USER" /srv/backups/supabase
```

テンプレートをコピーして値を設定:

```bash
cp scripts/backup/backup.env.example scripts/backup/backup.env
# scripts/backup/backup.env を編集
```

環境変数を読み込んで手動実行:

```bash
set -a
source ./scripts/backup/backup.env
set +a
./scripts/backup/supabase_backup.sh
```

WSL上で `backup.env` が CRLF の場合は `source` で失敗するため、1回だけ改行を修正します。

```bash
sed -i 's/\r$//' ./scripts/backup/backup.env
```

実行後に次の3ファイルが生成されることを確認:

- `/srv/backups/supabase/YYYYMMDD-HHMMSS/globals.sql`
- `/srv/backups/supabase/YYYYMMDD-HHMMSS/schema.sql`
- `/srv/backups/supabase/YYYYMMDD-HHMMSS/data.dump`

接続と実行環境の事前検証のみ行いたい場合:

```bash
./scripts/backup/raspi_preflight.sh
```

## 5. cron 設定（毎日1回）

例: 毎日 03:00 (UTC) に実行。

自動登録（推奨）:

```bash
./scripts/backup/install_backup_cron.sh
```

手動登録:

```cron
0 3 * * * . /path/to/monocore/scripts/backup/backup.env && /bin/bash /path/to/monocore/scripts/backup/supabase_backup.sh >> /srv/backups/supabase/cron.log 2>&1
```

## 6. 失敗時の確認

- スクリプトログ: `/srv/backups/supabase/backup.log`
- cronログ: `/srv/backups/supabase/cron.log`
- 空ファイルがあれば失敗扱いになるため、接続 URL と権限を確認する

## 7. ローカル復元（globals.sql なし）

復元前に、ローカルDBをクリーンにするため `npx supabase db reset` を先に実行してください。

```bash
npx supabase db reset
```

バックアップディレクトリを指定して復元:

```bash
export BACKUP_RUN_DIR='/srv/backups/supabase/YYYYMMDD-HHMMSS'
./scripts/backup/supabase_restore_local.sh
```

必要に応じて接続先を変更:

```bash
export LOCAL_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
```

この復元スクリプトは `globals.sql` を適用しません。ローカル開発で衝突しやすいロール/権限復元を避け、`schema.sql` と `data.dump` の再現に絞っています。

## 8. 注意

- この最小構成は「取得して保存する」ことに限定しています
- 暗号化、外部複製、通知は次フェーズで追加する想定です
