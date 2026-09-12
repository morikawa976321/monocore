---
name: project-board-abolished
description: 判断(2026-09-11) — monocoreのプロジェクト板(project_cards)を廃止した
created: 2026-09-11
updated: 2026-09-11
---

monocoreのプロジェクト板(`/projects`、`project_cards`テーブル、taskbox drain手順7のカード生成ロジック)を廃止した。DBのテーブルもDROP済み。

**理由(本人明言)**: 利用頻度がどんどん落ちてきて、半ば義務化していた。

廃止前の板の設計・運用の記録: [[project-board-purpose-and-card-bloat]](目的) / [[board-hierarchy-only-collapse-not-wip]](構造) / [[goal-layer-abolished]](直前の形) / [[no-second-writer-for-projected-tables]] / [[card-creation-requires-explicit-instruction]](drain側の運用規則)。2026-07-17の projects 面の削除([[monocore-projects-removal]])とは別で、そのあと2026-08に作り直した板を今回廃止した。
