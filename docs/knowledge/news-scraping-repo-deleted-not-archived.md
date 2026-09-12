---
name: news-scraping-repo-deleted-not-archived
description: 事実(2026-08-14) — news_scrapingはローカルフォルダもGitHubリポジトリも完全削除された(archiveではない)。移設前の履歴はもう参照できず、scraperのコードがそう書かれている理由はmonocore内のコメントにしか残らない
created: 2026-08-14
updated: 2026-08-14
---

# news_scraping は archive ではなく完全削除された

2026-08-14、[[news-scraping-moves-into-monocore]] / [[scraper-absorbed-but-not-rewritten]] の移設完了に伴い、`mf/news_scraping` はローカルフォルダも GitHub リポジトリ（private）も**本人が完全に削除**した。AI 側は「移植元として数ヶ月は参照価値があるので archive」を勧めていたが、採られなかった。

## 効いてくるところ

**移設前のコミット履歴はもう存在しない。** `monocore/scraper/` のコードが今の形になっている理由（OGP の属性順2パターン、`published_parsed` と `updated_parsed` の優先順、エンコーディングのフォールバック、XSS 対策の URL 検査など）は、コミットログではなく **monocore 内のコメントと README にしか残っていない**。移設時にコメントとして書き写した範囲が、そのまま残った全部である。

したがって scraper に手を入れるとき、「昔なぜこう書いたか」を git で遡ることはできない。コードのコメントが唯一の根拠であり、消すと復元できない。
