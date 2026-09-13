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

---

## 定期バックアップ（taskbox drain 統合、2026-08-30決定・実装）

冒頭の「定期実行は行わない」は2026-08-30時点で更新されている。2026-08-29のinbox空文字上書き事故（`monocore-inbox-emptied-by-single-device-autosave-race`、当時の復旧は2026-08-11の手動バックアップまでしか遡れず、その間の追記内容は失われた）を受けて、本番Supabaseの定期バックアップを `taskbox/drain.ps1` に統合した。

- 実体は `monocore/scripts/backup/supabase_periodic_backup.ps1`。drainの毎run終了時に `Invoke-MonocoreDbBackup` として呼ばれる（USBバックアップの `Invoke-Backup` と同じ status-file + ran_at 検証パターン）。枠はdrainと同じ01/07/13/19時＋ログオン時。構造定義は `taskbox/README.md` の「monocore本番DBの定期バックアップ」節。
- 保存先は `monocore/backups/auto/<timestamp>/{schema.sql,data.sql}`（手動バックアップの `backups/manual` とは別系統）。保持30日、超過分は自動削除。プレーンSQL保存なので `pg_restore` 無しで `psql -f` から読み書きできる。
- 資格情報は永続化せず、都度CLIのログイン済みセッションから解決する（本ドキュメント冒頭の方針を踏襲）。
- `pg_dump` は実行時点の実スキーマを丸ごと読むため、テーブル追加・削除・列変更があってもスクリプト側は無変更で追従する。
- drain報告板（monocore `/drain`）への行追加は2026-08-30時点で未着手（`Publish-DrainRun` への統合は別途リスク評価が必要と判断し見送り）。結果確認は `taskbox/drain.log` と `monocore/backups/auto/backup-status.json` のみ。

### Dockerを撤去した経緯（実装当日に発覚・修正）

当初は `npx supabase db dump --linked`（内部でDockerコンテナのpg_dumpを叩く）で実装したが、実装当日に **Docker Desktopが `sailor-ingest.sock` のバインドに失敗して繰り返しクラッシュする不具合**を実地で踏んだ（引き金は検証のための `Stop-Process -Force` 強制終了）。`wsl --shutdown` を含む複数の復旧策でも直らなかった。

無人実行のたびにDocker Desktop（GUIアプリ）の起動待ちに依存する設計自体が壊れやすいと判断し、**WSL2（`Ubuntu`ディストロ）に `postgresql-client-17`（apt.postgresql.org/PGDG。本番がPG17系のためバージョンを合わせる必要がある）を直接導入し、`pg_dump` をDocker無しで実行する方式へ書き換えた**。`wsl.exe` はGUIセッションが無くても動くため、無人実行との相性が良い。

**落とし穴**: WSLへの環境変数受け渡し（`$env:WSLENV`）は**コロン区切り**が正しい。スラッシュ区切り（例: `PGHOST/PGPORT`）は変数が2つ以上になると転送が黙って失敗する（値が全部空になるだけでエラーは出ない）。WSLビルド2.6.3.0で実地確認。1変数だけなら区切り文字を使わないため動いてしまい、気づきにくい。

## 誤削除からの復旧（pageinspect、VACUUM前限定・2026-07-17実施）

2026-07-17のmonocore M1検証中、置換方式RPCに空配列を渡してユーザーの実データ2行を削除する事故が発生した（詳細はknowledge/incidents.md「データ消失事故」）。バックアップが存在しなかった中、**VACUUM前ならpageinspectでdead tupleの生バイトを読んで全項目を原値のまま復元できる**ことを実証した。

### 手順

1. まだ `VACUUM` が走っていないことを確認する（`pg_stat_user_tables` の `last_vacuum` / `last_autovacuum` が空、`n_dead_tup` > 0）。走ると物理的に消えるので気づいたら即座にやる。
2. `CREATE EXTENSION pageinspect;`（superuser必須）
3. `heap_page_item_attrs(get_raw_page('<table>', <blkno>), '<table>'::regclass)` で全ページを走査し、`t_xmax <> 0`（削除済み）のタプルを拾う。`t_xmax` が削除したトランザクションIDなので、自分の事故のxidだけを対象にできる（他の古い削除を巻き込まない）。
4. 各属性のバイト列をPostgresの物理表現に従って復号する。
   - `uuid`: 16バイトraw → hexを8-4-4-4-12で区切る
   - `text`: varlena短形式は先頭1バイトが `(全長<<1)|1`、以降がUTF-8本体
   - `timestamptz`: 8バイト little-endian int64 = 2000-01-01 00:00:00 UTC からのマイクロ秒
5. 復号値でINSERTし直す（id・created_atも原値で戻せる）。
6. `DROP EXTENSION pageinspect;`

### 注意

- `xid` 型は順序演算子が無く `ORDER BY t_xmax` が通らない。`t_xmax::text` にキャストする。
- 移行直後に追加したカラム（`ALTER TABLE ADD COLUMN ... DEFAULT`）は**fast default**のため古いタプルには物理的に存在せず、属性が空で返る。その場合はDEFAULT値で復元するのが正しい。
- 復元の成否は**事故前に取った指紋**（`md5(string_agg(id::text,',' ORDER BY id))`）との一致で機械的に判定できる。破壊的操作の前にこの指紋を取る癖をつけると、原状復帰を証明できる。
