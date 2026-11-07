# STATUS

## 復帰同期が終わらず Inbox が開けない不具合(2026-11-07)

- ゴール: スマホで Schedules に戻ったとき、通信が止まっても編集ロックが降り、Inbox が開けること。復帰同期の発火条件の過不足を直すこと。
- 状態: 修正済み(通信と復帰同期に上限、ロックは読み直しの間だけ、見送りの再試行、`online` でも同期)。判断と理由は `docs/decisions.md` の「復帰同期のタイムアウト」。テストは `src/lib/schedules/sync.test.ts`、`src/lib/supabase/fetch-with-timeout.test.ts`。
- 未検証: 実機で止まっていた通信の特定。直ったかの確認はスマホで戻るのを繰り返して確かめる。再発したら decisions.md の末尾の手順で止まった通信を特定する。
- 本人待ち: なし。
