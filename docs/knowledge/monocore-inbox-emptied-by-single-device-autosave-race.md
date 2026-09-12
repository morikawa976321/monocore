---
name: monocore-inbox-emptied-by-single-device-autosave-race
description: 原因特定(2026-08-30、最有力仮説) — 2026-08-29にmonocore inboxes.contentが空文字列で上書きされた件。useInbox.tsのデバウンス保存+タブ非表示時の即時flushが原因で、全消し直後に中断されると空の状態がそのまま確定しうる
created: 2026-08-30
updated: 2026-08-30
---

# monocore inboxが空になった原因(2026-08-30、最有力仮説)

2026-08-29、monocore `inboxes.content`(1ユーザー1行のTEXT blob)が空文字列で上書きされた
(`updated_at=2026-08-29T14:16:00Z`)。DBには当該操作の監査ログが無く確定はできないが、
コード調査から次の経路が最有力:

**`monocore/src/hooks/useInbox.ts`の自動保存に、「空のまま確定してしまう」経路がある。**

- 入力から500ms後にデバウンス保存
- タブが**隠れる/ページが閉じる/フリーズする**瞬間、保存待ちがあれば**問答無用で即保存**
  (`flushPendingInboxSave`。`visibilitychange`/`pagehide`/`freeze`のいずれでも発火)
- `inboxes`に版履歴が無かった(schedulesの`schedule_day_revisions`とは違い、contentの
  過去値を一切保持しない設計)
- RLSにより本人ログイン中のアプリ自身が直接書き込める(`auth.uid() = user_id`)

つまり、**スマホ等で全選択して消す→貼り直す前にアプリがバックグラウンドに回った**ようなケースで、
空の状態がそのまま保存されうる。

似た「2台の端末で編集するとデータが消える」バグは2026-03-25に一度修正済み
(`b837b73 fix: fix bugs that DB data is lost when editting by two devices`)だが、それは
`hasPendingChanges`ガードで解消された別経路であり、**今回の「単一端末・保存の合間の中断」の
パターンは塞がれていない**(未修正のまま)。

## Why / How to apply

- 対策として[[monocore-inbox-revisions-content-history-added]]でcontent履歴テーブルを追加したが、
  これは**事後に遡れるようにする安全網**であり、空保存という事象自体は防いでいない。
  「保存直前に内容が大きく縮む場合は確認を挟む」等のUX側の修正は別途未着手。
- 同種の自動保存(デバウンス+バックグラウンド即flush)を持つ画面が他にもあれば、同じ risk class。

関連: [[monocore-inbox-revisions-content-history-added]] / [[monocore-db-periodic-backup-added-to-drain]]
