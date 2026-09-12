---
name: monocore-remote-migration-drift-fixed
description: 事実+運用知見(2026-07-17) — monocore本番DBで2026-04-13のmigrationが3ヶ月間未適用のまま隠れていた。push前の migration list / --dry-run 確認を必須とする教訓
created: 2026-07-17
updated: 2026-07-17
---

# monocore本番: 3ヶ月間隠れていたmigration未適用を発見・解消(2026-07-17)

## 事実

M1(AI編集権)のmigration `202607170830` を本番へpushする前に `npx supabase migration list` で確認したところ、**2026-04-13の古いmigration `202604131000`(タスク自動アンアーカイブRPC `apply_due_task_unarchives()`)が本番に一度も適用されていなかった**ことが判明した(`db push --dry-run` が明示的に検出)。ローカルには存在し記録上も"applied"だったため、これまで誰も気づいていなかった。

**影響**: このRPCは `/tasks` ページが waiting タブ取得前に必ず呼ぶ(期限到来したアーカイブ済みタスクを自動で未完了に戻す)。本番で関数が存在しない場合、この呼び出しはエラーになっていた可能性が高い(実際のフロントエンド挙動は未確認)。

ユーザー判断により、M1のmigrationと合わせて `--include-all` で一括適用し解消済み。適用後 `migration list` で local/remote 全10件の一致を確認、新設RPC `replace_schedules_for_day_as` がanon/publishable keyから401(permission denied)で拒否されることも本番で実機確認済み。

## 運用知見(一般化)

**「ローカルでmigrationを作って動いた」は「本番に必要なmigrationが全て適用済み」を意味しない。** 両者の乖離(drift)は静かに進行し、機能がある日突然本番だけ壊れる、あるいは今回のように誰も気づかないまま数ヶ月放置される。

- **本番へmigrationをpushする前は必ず `supabase migration list` (または `db push --dry-run`) で差分を確認する**。「今回追加した分だけ」という思い込みで `db push` すると、想定外の古い未適用分を見落とす/逆に想定外に巻き込む。
- 自動バックアップ(RasPiの定期ループ)が停止していた場合、`npx supabase db dump --linked --data-only -f <path>` でその場の手動スナップショットが取れる(pg_dumpがローカルPATHになくてもSupabase CLIが内部で処理する)。**このダンプファイルは認証トークン等の機微データを含むため、リポジトリの `.gitignore` に確実に含めること**(monocoreでは `backups/` 未追跡だったため今回`.gitignore`に追加した)。

関連: [[monocore-ai-edit-skill]] [[supabase-service-role-vs-authuid-rpc]]
