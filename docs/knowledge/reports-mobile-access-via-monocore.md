---
name: reports-mobile-access-via-monocore
description: 判断(2026-08-09) — mf/reports/をスマホから読む経路はmonocoreに読み取り専用ミラーを作る方式で確定。全件同期、reportsのコミットとupsertをセットで走らせる。面追加基準「毎日使うか」への本人の回答も含む
created: 2026-08-09
updated: 2026-08-09
---

# reportsのスマホ閲覧はmonocore経由（2026-08-09決定）

`mf/reports/`（30本・約1.2MB）をスマホから読みたいという要求に対し、**monocoreに読み取り専用のミラーを作る**方式で確定。

- **全件同期**（ホワイトリストによる選別はしない）
- **reportsのコミットとmonocoreへのupsertをセットで走らせる**（reports/CLAUDE.mdの「作ったらその場でコミット」規約に結線し、ミラーが腐るのを防ぐ）
- 型は `project_cards` と同じ「正はローカル / service_role で slug 単位 upsert / 画面は SELECT のみ」

## 選んだ理由

- 実体は「ラップトップがスリープ中の電車・ベッドで読む」なので24/7可用性が必須。Tailscale+ローカルHTTPはスリープで死に、GitHub private repoはreports規約が禁止している。クラウドDBしか残らず、それは既にある。
- 閲覧専用なので双方向同期の難所（schedulesが日単位版管理で払ったコスト）が丸ごと不要。

## 面追加基準への回答（制約10「本当に毎日使うか」）

**「レポートは毎日ではないが、電車内で確実に使う。問題ない」**（本人）。頻度が毎日でなくても、使う場面が具体的に特定できているなら足してよい、という基準の運用。なお過去に死んだ4面はすべて入力を伴う面で、今回は読み取り専用の導出物のため、使われなくなってもテーブルとページを消すだけで損失が出ない。

関連: [[monocore-third-pillar-of-ai-platform]] / [[monocore-user-gateway-decision]]
