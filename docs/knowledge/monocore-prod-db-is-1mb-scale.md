---
name: monocore-prod-db-is-1mb-scale
description: 事実(2026-08-26実測) — monocore本番Supabaseの実データは全テーブル合計約1MB・約1,200行しかなく、書き込みも記事5行/時+drain4回/日。SupabaseのDisk IO予算枯渇警告に対し「アプリのデータ量・クエリ最適化」を原因側に置くことはできない
created: 2026-08-26
updated: 2026-08-26
---

SupabaseからDisk IO予算枯渇の警告メールが来たため、monocore本番(ref: pfjqqhdxzadlpylsloyo)の実規模をPostgREST経由で実測した。

**行数**: schedules 480 / articles 625 / drain_runs 40 / schedule_day_notes 23 / reports 11 / project_cards 10 / inboxes 1 — 合計約1,200行。

**ペイロード実測**: reports の body_html 11本で合計558KB(最大136KB)、articles 全件のJSON応答227KB、drain_runs 全件163KB、inboxes のblob 166バイト。**ユーザーデータの総量は約1MB**。

**書き込み頻度**: news scraperがタスクスケジューラで毎時1回(1回あたりINSERT約5行・DELETE約5行、`Existing links` のSELECT 625行)。taskbox drainが1日4回+ログオン時に drain_runs へ1行upsert+prune。reports/project_cards の同期は drain.ps1 からは呼ばれておらず手動。

この規模ではDBはshared_buffersに丸ごと乗り、ウォームアップ後の読み取りIOはほぼゼロになる。**Supabaseの定型ガイド(クエリ最適化・インデックス追加・ページング)が効く余地は無い**ので、Disk IO警告の切り分けはアプリのクエリではなく、ダッシュボードのDisk IOグラフの形状(常時一定か・時刻に相関するか)から始めること。

関連: [[news-scraping-moves-into-monocore]] / [[monocore-third-pillar-of-ai-platform]]
