---
name: monocore-db-periodic-backup-added-to-drain
description: 決定・実装(2026-08-30、同日中にDocker依存を撤去) — monocore本番Supabaseの定期バックアップをtaskbox drainに統合(Invoke-MonocoreDbBackup)。実体はmonocore/scripts/backup/supabase_periodic_backup.ps1。当初npx supabase db dump --linked(Docker経由)で実装したが同日Docker Desktopの実クラッシュを踏み、WSL2に直接postgresql-client-17を入れpg_dumpを叩く方式へ書き換えた
created: 2026-08-30
updated: 2026-08-30
---

# monocore本番DBの定期バックアップをdrainへ統合(2026-08-30)

[[monocore-inbox-emptied-by-single-device-autosave-race]]の後始末。それまで
`monocore/backups/manual`は「必要なタイミングで手動取得」する運用で定期実行が無く、
今回の復旧は2026-08-11の手動バックアップまでしか遡れなかった(2026-08-09〜08-29の
追記、たとえば[[daily-procedures-live-in-monocore-inbox]]で追加した呼吸法・
口腔咽頭筋機能療法の手順は失われたまま)。

## 実装

- `monocore/scripts/backup/supabase_periodic_backup.ps1`を新設。`taskbox/drain.ps1`が
  毎run終了時に呼ぶ(`Invoke-MonocoreDbBackup`、USBバックアップ`Invoke-Backup`と同じ
  status-file+ran_at検証パターン)。枠はdrainと同じ01/07/13/19時＋ログオン時。
  `taskbox/README.md`の「monocore本番DBの定期バックアップ」節に構造定義がある。
- 保存先は`monocore/backups/auto/<timestamp>/{schema.sql,data.sql}`(手動バックアップの
  `backups/manual`とは別)。保持30日、超過分は自動削除。
- **資格情報を永続化しない**: `npx supabase db dump --linked --dry-run`がCLIのログイン済み
  セッションから都度接続情報を解決する(既存の`docs/supabase-backup.md`の方針を踏襲)。
  `--dry-run`自体はDockerを使わないことを実地で確認済み。
- **スキーマ変更で書き直し不要**: `pg_dump`がその時点の実スキーマを丸ごと読むため、
  テーブル追加・削除・列変更があってもスクリプト側は無変更。プレーンSQL保存なので
  `pg_restore`が無くても`psql -f`で読み書きできる。

## Dockerを撤去した経緯(同日中に発覚・修正)

当初は`npx supabase db dump --linked`(内部でDockerコンテナのpg_dumpを叩く)で実装し、
Docker Desktopが落ちていれば自動起動を試みる設計だった。ところが実装当日、ユーザーからの
「バックアップがdockerを使う?」という疑問をきっかけに実地検証したところ、**Docker Desktopが
`sailor-ingest.sock`のバインドに失敗して繰り返しクラッシュする実際の不具合**を踏んだ
(引き金は検証のため`Stop-Process -Force`で強制終了したこと)。`wsl --shutdown`を含む複数の
復旧策でも直らなかった。

無人実行のたびにDocker Desktop(GUIアプリ)の起動待ちに依存すること自体が壊れやすい設計
だったため、**WSL2(`Ubuntu`ディストロ)に`postgresql-client-17`(apt.postgresql.org/PGDG。
本番がPG17系のためバージョンを合わせる必要がある)を直接導入し、`pg_dump`をDocker無しで
実行する方式へ書き換えた**。`wsl.exe`はGUIセッションが無くても動くコマンドラインツールで、
Docker Desktopより無人実行との相性が良い。

**落とし穴**: WSLへの環境変数受け渡し(`$env:WSLENV`)は**コロン区切り**が正しい。スラッシュ
区切り(`PGHOST/PGPORT`)は変数が2つ以上になると転送が黙って失敗する(値が全部空になるだけで
エラーは出ない)。このWSLビルド(2.6.3.0)で実地確認した。1変数だけなら区切り文字を使わない
のでスラッシュ表記でも動いてしまい、気づきにくい。

## 未着手(スコープ外にした判断)

drain報告板(monocore `/drain`)への行追加は今回見送った。`Publish-DrainRun`はより中心的な
関数で、そこへの統合は別途のリスク評価をしてから、という判断。現状の結果確認は
`taskbox/drain.log`と`monocore/backups/auto/backup-status.json`のみ。

関連: [[monocore-inbox-emptied-by-single-device-autosave-race]] / [[monocore-inbox-revisions-content-history-added]]
