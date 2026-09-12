---
name: monocore-button-variants-too-many
description: 判断(2026-08-10) — monocoreのButtonはバリアントが増えすぎ(color6値×size7値)と評価。削減案を作らせる。README-design.mdの変更も許容(規約は不変の前提ではない)
created: 2026-08-10
updated: 2026-08-11
---

# Buttonのバリアントが増えすぎ（削減案を求める）

2026-08-10、プロジェクト板の回答: **「buttonのバリアントが増えすぎ。削減案を考えておいて。README-design.mdの変更も許容する」**。

2026-08-09の統一（[[monocore-button-variant-decision]]）で、生 `<button>` 9箇所を寄せるために `color` に `ghost`/`surface`/`link`、`size` に `icon`/`fab`/`bar`/`nav`/`link` を追加し、**color 6値 × size 7値**になった（当初「size 6値」と要約されていたが、実コードの `ButtonSize` は7値 — 2026-08-10にButton.tsxで確認済み。同ノートの訂正記載を参照）。「4形すべてをButtonへ折り込む」という当時の判断そのものは覆されていないが、**結果として出来上がった面の数を本人は過多と評価した**。

**効いてくること**:

- **`README-design.md`（デザイン規約）は変更を許容する対象**であり、実装をそこへ寄せ切ることだけが正解ではない。規約に合わせるためにバリアントが増えるなら、規約側を直す選択肢を先に出してよい。
- 求められているのは**案であって実装ではない**。

関連: [[monocore-design-doc-vs-practice-gap]] / [[user-design-aesthetic-preferences]]
