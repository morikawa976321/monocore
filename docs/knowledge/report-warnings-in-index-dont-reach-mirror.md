---
name: report-warnings-in-index-dont-reach-mirror
description: 運用知見(2026-08-12) — reportsの_index.mdはmonocoreミラーの同期対象外なので、索引にだけ書いた「この結論は死んでいる」警告はスマホから読む面には届かない。警告は本文側に要る
created: 2026-08-12
updated: 2026-08-12
---

# 索引にだけ書いた警告は、スマホの読み手には届かない

`mf/reports/_index.md` は「今も生きているか」を書く場所として運用しているが、**monocoreの `/reports` ミラー（スマホから読む面）は `_index.md` と `CLAUDE.md` を同期対象から除外している**（`scripts/reports-payload.mjs` の `EXCLUDED_FILENAMES`）。

結果、**索引に警告を書く運用は、レポート本文を直接開く読み手に対して機能しない。**

実例（2026-08-12に検出）: `hci_core5_summaries.md` は冒頭が今も「**結論: 「優しい嘘 × well-being」の空白は全文レベルの精査でも生き残った**」で、この線が没になったこと（[[hci-theme-wellbeing-ai-botsu]]）は本文に一文字も無い。索引には2026-08-09から警告が書かれていたが、**スマホから開けば警告なしで死んだ結論に当たる**状態が続いていた。

## 規則として

**「結論が死んだ」型の警告は、索引ではなく本文の冒頭に書く。** 索引側の注記は、本文に書いた警告への案内か、複数レポートにまたがる関係の記述にとどめる。索引は「どれを読むか」を決める道具であって、**読むと決めた後の読み手はもう索引を見ていない。**

同型の注意: ミラーに出ない情報は `_index.md` だけではない。`archive/` 配下も同期対象外なので、archiveへ退避したレポートはスマホから引けない。

関連: freshness-sweep-checks-outside-world-only / [[reports-index-drift-from-autocommit-path]]
