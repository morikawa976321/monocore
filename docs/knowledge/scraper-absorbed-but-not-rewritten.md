---
name: scraper-absorbed-but-not-rewritten
description: 判断(2026-08-14) — news_scrapingはリポジトリごとmonocoreに吸収してフォルダを消すが、スクレーパーはPythonのまま移設しnodeへ書き直さない。統合の利益は言語と無関係に得られ、書き直しは既に直したバグを買い直すだけと判断した
created: 2026-08-14
updated: 2026-08-14
---

# 統合はリポジトリ単位で行い、言語は据え置く

2026-08-14、[[news-scraping-moves-into-monocore]] の続き。本人の提案で **`mf/news_scraping` はリポジトリごと monocore に吸収し、フォルダを削除する**ことにした（スクレイピングロジックも monocore 内に置く）。移設先は `monocore/scraper/`。

**ただしスクレーパーは Python のまま移す。node への書き直しはしない。** 当初 AI 側は「monocore に入れる＝node に揃える」と束ねて提案したが、本人の「pythonw のまま使えないのか」という問いで分離された。

## 理由（一般化できる形）

得たかったもの（フォルダをなくす・一箇所に統合する・スキーマとライターを同じコミットに乗せる）は**すべて言語に依存しない**。言語を変えて増える利益は「venv/pytest が消える」「Supabase 読み書きを既存の node 資産で書ける」の2点だけで、その対価は:

- **既に直したバグの塊を買い直すこと** — エンコーディングのフォールバック、OGP の属性順2パターン、`published_parsed` と `updated_parsed` の優先順、JST 変換、RDF フィードの解釈
- **一度解いた実行環境の問題を解き直すこと** — `pythonw.exe` によるウィンドウレス起動（node.exe はコンソールアプリなので毎時ウィンドウが点滅する）

**画面上は何も変わらないのに下振れだけがある取引**になるので採らない。移設のコストは polyglot リポジトリになること（venv・requirements・pytest が monocore に入る）だけで、これは受け入れる。

## 併せて決めた歯止め

monocore の責務が「人間向けの窓口＋導出物の受け皿」から「外界から取り込むワーカーを持つ」に広がるため、`docs/design.md` に1行入れる: **収集ジョブを monocore に置いてよいのは、その出力を monocore の面が表示する場合に限る。** 面を持たない収集は taskbox の管轄。

関連: [[news-scraping-moves-into-monocore]] / [[monocore-third-pillar-of-ai-platform]] / [[design-docs-live-with-the-code]]
