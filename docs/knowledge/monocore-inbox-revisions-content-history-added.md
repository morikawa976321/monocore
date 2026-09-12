---
name: monocore-inbox-revisions-content-history-added
description: 対策(2026-08-30) — monocore inboxesのUPDATE直前のcontentを退避するinbox_revisionsテーブル+トリガーを新設(migration 20260830010000)。schedule_day_revisionsは楽観ロック用カウンタでありcontent履歴ではないので流用不可、と判明したうえでの設計
created: 2026-08-30
updated: 2026-08-30
---

# monocore inboxesにcontent履歴テーブルを追加(2026-08-30)

[[monocore-inbox-emptied-by-single-device-autosave-race]]への対策。migration
`monocore/supabase/migrations/20260830010000_add_inbox_revisions.sql`で
`public.inbox_revisions`テーブルと`BEFORE UPDATE`トリガーを新設し、本番へ適用済み
(`npx supabase db push --linked`で確認)。

**重要な誤解の訂正**: 対策検討時、「`schedules`にある`schedule_day_revisions`と同じ仕組みを
`inboxes`にも」という発想が出たが、`schedule_day_revisions`の実体は
`(user_id, day_key, revision BIGINT, updated_at)`という**楽観ロック用のカウンタ**であり、
過去のcontentを一切保持しない。つまり「schedule同様のrevision」を字義通り真似ても、
今回のような**上書きされた値を読み返す**用途には使えない。今回新設したのは別物で、
UPDATE直前の`content`をそのまま複製する単純な履歴テーブル。

## 設計

- `inbox_revisions(id, user_id, content, revised_at)`。RLSはSELECTのみ(自分の分だけ)。
- `record_inbox_revision()`(SECURITY DEFINER)が`BEFORE UPDATE ON inboxes`で発火し、
  `OLD.content IS DISTINCT FROM NEW.content`のときだけ退避 → 同一ユーザーの保持件数を
  直近50件に切り詰め。no-op更新(値が変わらない保存)では増えない(ローカルで実証済み)。
- 保持件数50件は本番DBがMB未満規模([[monocore-prod-db-is-1mb-scale]])であることを踏まえた値。
  増やしたければmigrationの`LIMIT 50`を変更するだけでよい。

## Why / How to apply

- これは**事後に遡れる安全網**であり、[[monocore-inbox-emptied-by-single-device-autosave-race]]
  で特定した「空保存が起きる経路」自体は塞いでいない。空保存が再発しても、次回からは
  `SELECT content FROM inbox_revisions WHERE user_id = ... ORDER BY revised_at DESC LIMIT 1`
  で直前の値をすぐ取り戻せる。
- 他のテーブルで「過去の値を読み返したい」要求が出たときも、`schedule_day_revisions`を
  参考実装だと思わないこと(カウンタ専用)。今回のトリガー方式(`record_inbox_revision`)を
  雛形にする。

関連: [[monocore-inbox-emptied-by-single-device-autosave-race]] / [[monocore-db-periodic-backup-added-to-drain]]
