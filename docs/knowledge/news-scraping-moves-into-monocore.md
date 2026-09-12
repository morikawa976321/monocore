---
name: news-scraping-moves-into-monocore
description: 判断(2026-08-14) — news_scrapingの記事保存をJSONLからmonocoreのSupabaseへ移し、閲覧面はmonocore /newsに一本化してFlaskアプリを撤去する。保持は現状踏襲(8日で物理削除)で蓄積案は却下
created: 2026-08-14
updated: 2026-08-14
---

# news_scrapingをmonocoreに統合する（JSONL→Supabase）

2026-08-14、`mf/news_scraping` の記事データを `static/articles.jsonl` から monocore の Supabase（`public.articles`）へ移す方針を本人が決定した。

## 決めたこと

1. **閲覧面は monocore `/news` に一本化する。** LAN内限定の Flask アプリ（`app.py`・`templates/`・タスク `NewsScraping_FlaskWeb`）は撤去する。選んだのは「スマホから読めるようになる／UIを2つ保守しない／常駐プロセスが1本減る」を理由として提示した選択肢で、対案（Flask併存・DB移行だけで面は作らない）は採らなかった。
2. **保持は現状踏襲**（`published` が8日より古い行を毎回物理削除）。「DBには蓄積して表示側だけ直近N日に絞る」（年2万行・数MBで無料枠に収まり、RSS再出現による重複復活も消える）を推奨として提示したが**採らなかった**。理由は述べられていない。

## 派生した設計上の事実

`articles` は monocore で唯一「正がDBにあり、かつ人間が書いたものでもない」テーブルになる。既存の導出物3つ（`reports` / `project_cards` / `drain_runs`）は消えても再生成できるが、RSSは過去記事を配らないので `articles` は消えたら戻らない。保持8日を選んだため、失われうる最大値は「8日以内に読み逃した記事」。

関連: [[monocore-mirror-design-principles]] / [[monocore-third-pillar-of-ai-platform]] / [[design-docs-live-with-the-code]]
