---
name: monocore-ai-edit-skill
description: monocore M1(AI編集権)完了(2026-07-17) — Claudeセッションからmonocoreのschedulesを読み書きするスキルの所在・機能と設計判断(案A採用の理由・REVOKE必須・既定env=remote・AIマーク粒度は日単位許容)
created: 2026-07-17
updated: 2026-08-25
---

# monocore M1: AI編集権スキル（完了 2026-07-17）

Claude Codeセッションから会話でmonocoreを読み書きできる。**スキルが対応する対象は schedules（予定）のみ** — tasks/knowledge/projects はページ・DBテーブル・スキルコマンドごと完全削除済み（[[monocore-projects-removal]] / [[monocore-list-pages-reconsideration]]。`monocore.py` と `SKILL.md` に残存が無いことは2026-07-30に裏取り済み）。**Claudeアプリからの予定挿入は使用中**（2026-08-06本人申告）。

## 所在と機能

- スキル: `~/.claude/skills/monocore/`（`SKILL.md` + `monocore.py`。Python標準ライブラリのみ。**`~/.claude/skills/` はgit管理外**という既知の制約あり）
- 認証: service role key。置き場は `%USERPROFILE%\.monocore\config.json`（monocoreリポジトリ外・平文コミット禁止）
- 機能: list/show/add/append/update と `set-status`（{active,completed,deleted}切替＝論理削除と復元。`--dry-run` で対象titleを表示 — [[replace-rpc-empty-items-data-loss]]の「破壊的操作の前に対象を確認する」の実装）。楽観ロック（read時 `updated_at` の条件付きPATCH）・`updated_by='agent'` は書き込み系共通。
- **既定環境は `remote`（本番）**。当初は「本番を壊さない安全策」として `local` を既定にしていたが、localはラップトップ上の開発用砂場で、ユーザーのスマホ・ブラウザが見る本番とは別物のため**AI編集が実データに一切反映されない設計ミス**だった（本人指摘で修正）。localは開発・検証専用。**教訓: 「本番データを壊さない安全策」と「機能の既定動作」を同じフラグに乗せると、安全のつもりが機能そのものを殺す。既定値は実ユースケースを満たすかで決める。**

## 採用した設計: 案A（service_role専用RPC）

service_roleのJWTには `sub` が無く `auth.uid()` がNULLになるため、既存のユーザーセッション用RPCがそのまま使えない（[[supabase-service-role-vs-authuid-rpc]]）。3案から **案A＝service_role専用RPC `replace_schedules_for_day_as(p_user_id, ...)` を加算的migrationで新設**を採用（既存RPCは変更していない）。

- **案B（JWT secretで `sub` 入りトークンを自前発行）却下**: 署名鍵の所持＝任意ユーザーへのなりすまし能力であり、service key限定方針に反しリスクが高い。
- **案C（RPC非使用でDELETE+INSERTを再実装）却下**: 「その日を丸ごと安全に置換する」アトミック性をスキル側で二重実装することになり、2026-03-25に修正した2デバイス編集でのデータ喪失と同種の競合リスクを負う。

**セキュリティ要点**: この関数はSECURITY DEFINERかつ引数でuser_idを受け取り認証チェックを持たないため、Postgres既定のPUBLIC EXECUTEのままだと**anonが任意ユーザーの予定を破壊できる**。`REVOKE ALL FROM PUBLIC, anon, authenticated` → `GRANT EXECUTE TO service_role` が必須（実装済み・本番でanon/publishable keyが401になることを実機確認済み）。**今後同種のservice_role専用RPCを追加する際も同じREVOKEを必ず付けること。**

## AIマーク粒度は日単位の粗さを許容

置換方式RPCはその日を削除→再挿入するため、AIが1件足しただけでその日の既存予定（人間が入れたもの）まで `updated_by='agent'` になる。(a)許容 (b)`p_items` 各要素に `updated_by` を持たせRPCが引き継ぐ (c)schedulesだけマーク非表示 のうち **(a)を採用**。

関連: [[monocore-user-gateway-decision]] / [[monocore-infra-fixed-cloud-async]] / [[postgrest-plus-sign-query-encoding]]
