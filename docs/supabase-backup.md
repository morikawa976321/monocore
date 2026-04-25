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
# 実行権限がない場合は ./ ではなく bash で起動する（Permission denied 回避）
bash scripts/backup/raspi_setup.sh
```

または先に実行権限を付けてから:

```bash
chmod +x scripts/backup/raspi_setup.sh
./scripts/backup/raspi_setup.sh
```

続き:

```bash
cp scripts/backup/backup.env.example scripts/backup/backup.env
# scripts/backup/backup.env を編集
./scripts/backup/raspi_preflight.sh
./scripts/backup/install_backup_cron.sh
```

手動で個別に実施する場合:

```bash
cd /path/to/monocore
chmod +x scripts/backup/raspi_setup.sh
chmod +x scripts/backup/supabase_backup.sh
chmod +x scripts/backup/supabase_restore_local.sh
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

### Permission denied が出たとき

- **`./scripts/backup/raspi_setup.sh` の直後だけ**  
  Git 由来のファイルは実行ビットが付いていないことがあります。次のいずれかで起動してください。

```bash
bash scripts/backup/raspi_setup.sh
```

```bash
chmod +x scripts/backup/raspi_setup.sh
./scripts/backup/raspi_setup.sh
```

- **`sudo apt-get` や `/srv` 作成で Permission denied**  
  `sudo` が使えるユーザーで実行しているか確認してください。`sudo` が無い場合は root でログインするか、`sudo` を設定してください。

- **USB ストレージなどを `noexec` でマウントしている**  
  そのパス上の `./script.sh` は実行できません。上記のとおり `bash script.sh` で実行するか、リポジトリを `noexec` でない場所（例: `/home/pi/monocore`）に置いてください。

## 7. メインPCへのコピー（`scp`）

バックアップ1回分は Pi 上の `BACKUP_DIR` 直下の日時フォルダにあります（既定では `/srv/backups/supabase/YYYYMMDD-HHMMSS/`）。  
メインPCから **SSH で Pi に接続できること**（`ssh ユーザー@ラズパイのIP`）が前提です。

### フォルダごとコピーする例

メインPCのターミナル（PowerShell / WSL / Git Bash）で、**メインPC側に保存先ディレクトリを用意してから**実行します。

```bash
scp -r tm976@192.168.11.36:/srv/backups/supabase/20260418-141837 /mnt/c/Users/tm976/backups/supabase/
```

- `tm976` … Pi のログインユーザー
- `192.168.1.10` … Pi の IP（`hostname -I` などで確認）
- 最後のパス … メインPC側の保存先（WSL なら `/mnt/c/...`、Windows パスをそのまま使うツールなら適宜読み替え）

### 3ファイルだけ取る例（bash 系）

```bash
scp tm976@192.168.1.10:/srv/backups/supabase/20260418-141837/{globals.sql,schema.sql,data.dump} /mnt/c/Users/tm976/backups/
```

PowerShell では `{a,b}` が使えないことがあるため、その場合はファイルを3回に分けて指定するか、上記の **フォルダごと `scp -r`** を使ってください。

### 補足

- 通信は SSH 経由のため、平文でネットワークに流れるわけではありません。共有ストレージに置く場合は取り扱いに注意してください。
- 大きい場合は `rsync -avz` の方が再開しやすいです（WSL などで `rsync` がある環境向け）。

## 8. ローカル復元（globals.sql なし）

このスクリプトは **bash** 向けです。**PowerShell 上で `export` を実行しても環境変数は引き継がれません**。次のいずれかで実行してください。

- **WSL の bash** で `monocore` に `cd` してから実行する
- または **1行で**: `bash -lc "cd ~/monocore && export BACKUP_RUN_DIR='/mnt/c/Users/.../20260418-141837' && export LOCAL_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' && ./scripts/backup/supabase_restore_local.sh"`

`BACKUP_RUN_DIR` は **`C:\...` でも可**（スクリプトが Unix 形式に変換します）が、トラブル時は次のように **環境に合ったパス** を直接指定すると確実です。

- **Git Bash（MINGW64）**: `/c/Users/あなた/mf/20260418-141837`（先頭は **`/mnt/c` ではない**。`/mnt/c` は **WSL 専用**）
- **WSL**: `/mnt/c/Users/あなた/mf/20260418-141837`

**Git Bash + Docker Desktop** では、`psql` の `--file=/backup/...` がパス変換で壊れることがあるため、スクリプト側で `MSYS_NO_PATHCONV=1` を付けています。それでも接続できない場合は、コンテナからホストの Postgres へ届かないことがあり、そのときは次を試してください。

```bash
export LOCAL_DB_URL='postgresql://postgres:postgres@host.docker.internal:54322/postgres'
```

（`--network host` は Windows 版 Docker では期待どおりに動かないことがあります。）

復元前に、ローカルDBをクリーンにするため `npx supabase db reset` を先に実行してください。

```bash
npx supabase db reset
```

### ローカル Supabase でよく使う手順（推奨）

`npx supabase db reset` 後のローカルDBには、**すでに `auth` などのスキーマ**が存在します。ここに本番の `schema.sql` をそのまま流すと、`schema "auth" already exists` のように **衝突**します。

**リポジトリのマイグレーションが本番と一致している**（＝スキーマは `db reset` で再現できる）前提なら、**データだけ**を復元します。

```bash
export BACKUP_RUN_DIR='/c/Users/あなた/mf/YYYYMMDD-HHMMSS'
export RESTORE_DATA_ONLY='1'
./scripts/backup/supabase_restore_local.sh
```

本番とローカルでスキーマが一致し、**空の Postgres にフルスキーマを適用したい**場合のみ、`schema.sql` も流す既定モード（`RESTORE_DATA_ONLY` 未設定または `0`）を使います。その場合は Supabase の初期スキーマと二重にならないよう、別途方針が必要になることがあります。

### バックアップディレクトリを指定して復元（`schema.sql` + `data.dump`）

```bash
export BACKUP_RUN_DIR='/srv/backups/supabase/YYYYMMDD-HHMMSS'
./scripts/backup/supabase_restore_local.sh
```

必要に応じて接続先を変更:

```bash
export LOCAL_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
```

WSL でバックアップを `C:\Users\...` に置いている場合は、次のいずれかにしてください。

- `export BACKUP_RUN_DIR='/mnt/c/Users/.../20260418-141837'` のように **Unix 形式のパス** を指定する（スクリプトは `C:\` 形式を可能な範囲で自動変換します）
- 可能なら `sudo apt install postgresql-client` のうえ `export PG_CLIENT_MODE=local` とし、**ホストの `psql` / `pg_restore`** で実行する（Docker よりトラブルが少ないことがあります）

Docker Desktop 利用時、コンテナからホストの Postgres に繋がらない場合は、`LOCAL_DB_URL` を環境に合わせて調整してください（例: `host.docker.internal`）。

この復元スクリプトは `globals.sql` を適用しません。ローカル開発で衝突しやすいロール/権限復元を避け、`schema.sql` と `data.dump` の再現に絞っています。

## 9. 注意

- この最小構成は「取得して保存する」ことに限定しています
- 暗号化、外部複製、通知は次フェーズで追加する想定です
