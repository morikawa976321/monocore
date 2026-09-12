---
name: drain-board-keep-48-no-skip-card-consolidation
description: 事実+本人決定(2026-09-11) — monocore /drain板はupsert時のプルーニングで保持件数が頭打ち(40→48へ引き上げ、24枠×2日分)。連続スキップカードの統合UIは同日前半に見送ったが、8:00〜14:00の7回連続スキップが48枚中7枚を占めた実例で同日後半に実装へ戻した(groupDrainRunsが隣接2件以上のskippedを1枚に畳む。crashedは畳まない)
created: 2026-09-10
updated: 2026-09-12
---

# /drain板: 保持件数48、連続スキップカードは1枚に畳む(2026-09-11確定)

## 元の設計(事実)

`monocore\scripts\upsert-drain-run.mjs` は `drain_runs` テーブルへupsertするたびに `pruneOlderThanKeep(supabase, DRAIN_RUNS_KEEP)` を実行し、`started_at` 降順でKEEP件目より古い行を削除する。フロント(`monocore\src\app\drain\page.tsx`)も `DRAIN_RUNS_LIST_LIMIT` で直近分のみ取得・ページネーション無し。**行数は元々青天井ではなく常にKEEP件で頭打ち**(2026-09-10まで40)。

4回/日運用では40件≒直近10日分が見えていたが、1時間おき([[taskbox-drain-hourly-schedule]])では40件≒直近1.7日分に縮む。「スキップ系カードが1440行/月溜まる」という当初の懸念はプルーニングにより起きないが、見える履歴が縮む問題が代わりに出る。

## 決定の経緯

1. (2026-09-10) 当初方針: 連続スキップを1カードにまとめたい。
2. (2026-09-11 前半) 保持件数を40から48(1時間おき24枠の2日分)へ引き上げるだけで十分と本人が判断し、統合UIは見送った。
3. (2026-09-11 後半) 実運用で 08:00〜14:00 の7回が実際に連続スキップになり、48枚中7枚を1つの事象が占める実例が出たため、**統合UIを実装することに決定を戻した**。

## 現在の形(実装済み)

- 保持件数 `DRAIN_RUNS_KEEP` / `DRAIN_RUNS_LIST_LIMIT` = **48**。
- `monocore/src/lib/drain/group-runs.ts` の `groupDrainRuns()` が、一覧(started_at降順)で隣接する2件以上の `outcome === 'skipped'` をグループ化する純関数。孤立した1件はそのまま個別カード。
- **`crashed` は畳まない**(畳んで埋もれさせると異常の合図を見落とすため。統合UI設計時にAI側が指摘・本人了承)。
- 表示は `DrainRunGroupCard`(時刻範囲+件数の要約、展開すると中身は既存の `DrainRunCard` をそのまま並べる)。`page.tsx` から `groupDrainRuns` を通して描画。

関連: [[taskbox-drain-skip-when-no-claude]]
