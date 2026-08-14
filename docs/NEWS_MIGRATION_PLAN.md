# news_scraping を monocore に吸収する実装計画

作成 2026-08-14。**移行が完了したらこのファイルは削除する**（実装が参照しない計画表は腐っても誰も気づかない — `docs/design.md` §3 の教訓）。

## 0. 決定事項（2026-08-14・本人）

1. **閲覧面は monocore `/news` に一本化する。** LAN 内限定の Flask アプリは撤去する。
2. **記事の保持は現状踏襲**（`published` が8日より古い行は物理削除）。蓄積案は採らない。
3. **`mf/news_scraping` はリポジトリごと monocore に吸収し、フォルダを削除する。** スクレイピングロジックも monocore に入れる。
4. **スクレーパーは Python のまま。node へ書き直さない。** 目的（フォルダをなくす・一箇所に統合する・スキーマとライターを同じコミットに乗せる）は言語と無関係に達成される。書き直しで壊れうるのは既に直したバグの塊（エンコーディングのフォールバック・OGP の属性順2パターン・`published_parsed` と `updated_parsed` の優先順・JST 変換・RDF フィード）と、一度解いた `pythonw.exe` によるウィンドウレス起動であり、画面上は何も変わらないのに下振れだけがある取引になる。

## 1. 移行後の姿

```
RSS各サイト ──┐
              ├─→ monocore/scraper（pythonw・毎時） ──upsert/delete──→ Supabase public.articles
OGP画像取得 ──┘                                                              │
                                                                            │ SELECT (authenticated)
                                                                            ↓
                                                                monocore /news（スマホ可）
```

- ローカルに記事データは残らない（`articles.jsonl` は書かれなくなる）。**記事の正は Supabase**。
- `/news` は**読むだけの面**にする（`docs/design.md` 制約2「導出物に手入力欄を作らない」）。
- monocore は「人間向けの窓口 + 導出物の受け皿」に加えて**外界から取り込むワーカーを持つ**ことになる。歯止めを §5 に置く。

### ディレクトリ

```
monocore/
  scraper/                # ← news_scraping から移設（Python）
    .venv/                # .gitignore に追加。移設ではなく新規作成（下記 §6-1）
    requirements.txt      # ルートには置かない（下記 §6-3）
    config.json           # rss_sites / blacklist_prefixes / max_age_days
    config.py             # CONFIG_PATH を scraper/ 基準に変更（§6-2）
    fetch_rss.py          # 無改修に近い（collect_new_rss_articles / get_article_image）
    log_config.py         # 無改修（logs/ の位置だけ変わる）
    store.py              # 新規: Supabase 読み書き
    run_once.py           # scheduler_runner の後継（ワンショット）
    logs/                 # .gitignore に追加
    tests/
  scripts/                # 既存の node 投入スクリプト3本（触らない）
  src/app/news/           # 面
  supabase/migrations/    # articles
```

## 2. スキーマ

migration を1本追加する（`supabase/migrations/<ts>_add_articles.sql`）。

```sql
CREATE TABLE public.articles (
    link         TEXT PRIMARY KEY,
    source       TEXT NOT NULL,
    title        TEXT NOT NULL,
    published    TIMESTAMPTZ,
    image_url    TEXT,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select articles"
ON public.articles FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_articles_published ON public.articles (published DESC NULLS LAST);

GRANT SELECT ON public.articles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO service_role;
```

- **PK は `link`。** 現行の重複排除キー（`load_existing_links`）がそのまま主キーになる。
- **`collected_at` は retention の穴を塞ぐため。** RSS に `published` が無い記事は現行の `truncate_articles_json` でも消えない（`date_key` が空の行を残す実装）。DB でも同じにすると NULL 行が永久に残るので、削除条件は `COALESCE(published, collected_at) < threshold` 相当にする。
- `image_url` は JSONL の `image`。空文字ではなく NULL を入れる。
- **`articles` は monocore で唯一「正が DB にあり、かつ人間が書いたものでもない」テーブルになる。** 既存3つの導出物（`reports` / `project_cards` / `drain_runs`）は消えても再生成できるが、RSS は過去記事を配らないので `articles` は戻らない。保持8日なので失われうる最大値は「8日以内に読み逃した記事」。バックアップは持たない。**この分類は README の表と `docs/design.md` に明示する**（Phase 5）。

## 3. 書き込み経路

`scraper/store.py` から `requests` で PostgREST を直接叩く（`requests` は既存依存。`supabase-py` は追加しない — 使うエンドポイントが3つしかなく、依存を増やす見合いがない）。

- **認証情報は `~/.monocore/config.json` の `envs.remote` を読む**（スキル `monocore.py` と同じ流儀）。リポジトリの外にあるので鍵をコミットする事故が起きない。読み込みは `encoding="utf-8-sig"`（このファイルは BOM 付き）。**キーの値をログ・例外メッセージに出さない。**
- 環境変数へ転記する手順は採らない（Claude Code の権限分類器に落とされる実績があるため）。
- 副産物として**スクレーパーがローカル状態を持たなくなる**: 既存リンク集合を毎回 DB から引くので、書き込みに失敗した記事は次回の巡回で自然に再取得される。「ローカルと DB が食い違う」状態が原理的に発生しない。

## 4. フェーズ

### Phase 1 — スキーマを通す（30分）✅ 2026-08-14 実施（`db push` を除く）

1. ~~migration 追加 → `npx supabase migration up` でローカル適用・確認。~~ → `20260814225300_add_articles.sql`。ローカル適用・構造/RLS/GRANT の確認、および PostgREST 経由の契約検証（upsert・重複無視・retention 削除・ページング・anon 遮断）まで完了。
2. **`npx supabase db push`（本番反映）は本人が1コマンド打つ。** AI セッションからは自動許可ゲートに弾かれて実行できない。**← 残っているのはここだけ。**
3. ~~型生成~~ → `src/types/database.types.ts` に `articles` の27行を追加済み（§6-11 の理由により、生成物での全置換ではなく差分の手挿入）。`npx tsc --noEmit` と `npm test`（57件）が通ることを確認。

**完了条件**: リモートに `articles` があり、`database.types.ts` に型が出ている。

### Phase 2 — scraper の移設と Supabase 書き込み化（2〜3時間）

1. **移設（コピー）**: `fetch_rss.py` / `log_config.py` / `config.py` / `config.json` / `tests/` を `monocore/scraper/` へ。
2. **`config.py` の修正**: 現行は `CONFIG_PATH` を「`scraper/` の親」に取るので、そのまま移すと monocore のルートに `config.json` を探しに行く。`SCRIPT_DIR` 基準に変える。`get_articles_path` は削除、`config.json` から `articles_file` キーを削除。
3. **`store.py` 新規**: 設定と認証情報の読み込み、既存リンク集合の取得（**ページング必須** — §6-4）、`link` 単位 upsert（`Prefer: resolution=ignore-duplicates`）、期限切れ削除。
4. **`run_once.py` 新規**（`scheduler_runner.py` の後継）: 1回分の巡回 → upsert → 期限切れ削除で終了する。常駐（`schedule.every(1).hour`）はやめ、**タスクスケジューラの毎時トリガーで起動する**。常駐は落ちても誰も気づかず再起動でしか復旧しないが、ワンショットなら失敗は次の枠で自然に回復し、`schedule` 依存も消える。
5. **venv の新規作成**: `.venv` は内部に絶対パスを持つのでコピーでは動かない（§6-1）。`monocore/scraper/.venv` を作り直す。`requirements.txt` は `feedparser` / `requests`（開発時 `pytest`）。**flask・waitress・schedule は落とす。**
6. **移設しないもの**: `app.py` / `templates/` / `static/` / `run_web.ps1` / `setup.ps1` / `setup.sh` / `safe_write_json.py` / `truncate_articles_json.py` / `utils.py` / `tests/test_safe_write_json.py` / `tests/test_truncate_articles_json.py`。これらは Phase 4 のフォルダ削除で消える。
7. **テスト**（`scraper/tests/test_store.py` 新規）: 記事 dict → 行への写像（`image` 空文字 → NULL、`published` 未取得 → NULL）／削除しきい値の計算と `published` NULL 行が `collected_at` で判定されること／既存リンク取得のページング（fake HTTP で1000行超を固定）。`test_scheduler_runner.py` は store をフェイクに差し替えて `run_once` 用に生かす。`fetch_rss.py` は無改修なので既存テストがそのまま回帰検査になる。
8. **タスク再登録**: `NewsScraping_Scraper` を解除し、`monocore\scraper\.venv\Scripts\pythonw.exe` を毎時トリガーで実行する新タスクを登録（`pythonw.exe` なのでウィンドウは出ない — 現行と同じ方式）。`logs/scraper.log` の出力先が `monocore/scraper/logs/` に変わることを確認する。
9. **初期投入（使い捨て）**: `news_scraping/static/articles.jsonl`（507行）を一度だけ流し込む。移行直後の `/news` が空にならないようにするため。実行後にスクリプトを削除する。

**完了条件**: 手動1回の実行で新着が Supabase に入り、8日より古い行が消え、2回目で重複が増えない。毎時タスクがウィンドウを出さずに動く。`logs/scraper.log` にキーが出ていない。

### Phase 3 — monocore `/news`（2〜3時間）

- `src/lib/supabase/queries/articles.ts` — `select('link,source,title,published,image_url')` を `published desc nulls last` で。`select('*')` は使わない（`reports.ts` と同じ規律）。
- `src/app/news/page.tsx` — `src/app/reports/page.tsx` と同型（`'use client'` + `PageHeader` の更新ボタン + 初回ローディング）。
- `src/components/news/ArticleList.tsx` — ソース別タブ（`ALL` + サイト名、件数付き）とカード。**画像は素の `<img loading="lazy">`**（`next/image` は外部ドメインの許可設定が要るうえ、この面に最適化の必要がない）。読み込み失敗時に「画像なし」へ差し替える現行挙動を踏襲。
- `src/lib/news/group.ts` + `group.test.ts` — ソース分類・件数・並び替えの純関数（現行 `static/js/script.js` の `groupArticlesBySource` 相当）。
- `src/components/layout/Sidebar.tsx` の `MENU_ITEMS` に1行追加（`lucide-react` の `Newspaper`）。
- デザインは `README-design.md` に従う（Neutral + Amber、`shadow-*` 禁止、角丸は `rounded-sm` / `rounded`）。

**完了条件**: スマホからログイン状態で `/news` を開くと最新記事がソース別に読め、リンクが別タブで開く。

### Phase 4 — 撤収（1時間）

- タスクスケジューラ `NewsScraping_FlaskWeb` を解除（`NewsScraping_Scraper` は Phase 2-8 で解除済み）。
- **数日運用してから** `mf/news_scraping` をローカルから削除する。それまでは残す（`static/articles.jsonl` がロールバック材料になる）。
- GitHub の `morikawa976321/news_scraping` は削除せず **archive** にする（private リポジトリなので公開資産の問題はない。移植元として数ヶ月は参照価値がある）。
- 削除で `.venv`（Python 3.11）・`requirements.txt`・`setup.ps1`・`setup.sh`・Flask 一式が一緒に消える。

**完了条件**: `pythonw` の常駐が0本になり、LAN に開いたポートが無くなる。`mf/` から news_scraping が消えている。

### Phase 5 — 記録（30分）

- `README.md` の「データの正と書き込み規約」の表に `articles` の行を追加（書き込み = `service_role` のみ / 正 = **Supabase 自身**）。`docs/design.md` §1-2 に「導出物ではない第3の分類」を1文で追記。
- `README.md` に「`scraper/` だけ Python」を1行明記する（TS スタック前提で読む後続のエージェントが迷わないように）。
- `docs/design.md` に歯止めを1行（§5）。
- context-engine `01_inbox` に判断メモ（本計画の決定事項は着手時点で記録済み）。
- 本ファイルを削除。

## 5. 歯止め（design.md に入れる1行）

> **収集ジョブを monocore に置いてよいのは、その出力を monocore の面が表示する場合に限る。**

理由: monocore の責務が「窓口 + 導出物の受け皿」から広がる以上、次に別の収集対象が来たときに雑多なジョブ置き場になる入口を塞いでおく。面を持たない収集は taskbox の管轄。

## 6. 既知の落とし穴（着手前に読むこと）

1. **`.venv` は移動できない。** 内部に絶対パスを持つので、コピーした venv は壊れる。移設先で作り直す。
2. **`config.py` の `CONFIG_PATH` は「`scraper/` の親」を見ている。** 直さずに移すと monocore ルートの `config.json` を探しに行く。
3. **`requirements.txt` をリポジトリのルートに置かない。** monocore を Vercel にデプロイしている場合、ルートの `requirements.txt` と `api/*.py` は Python ランタイムの自動検出対象になる。`scraper/` 配下なら検出されない。
4. **PostgREST の `max_rows` は 1000**（`supabase/config.toml`）。既存リンクを一括取得すると行が増えたとき黙って切れ、**重複記事が復活する**。`Range` ヘッダでページングし、返却行数が上限未満になるまで回す。
5. **クエリ文字列に timestamptz を素で埋めると `+` が空白扱いになり 22007 で失敗する。** UTC の `Z` 表記にするか URL エンコードする。
6. **`~/.monocore/config.json` は UTF-8 BOM 付き。** Python は `utf-8-sig` で読む。
7. **service_role キーは RLS を迂回する。** このキーを持つプロセスは `inboxes` を含む全テーブルを読める。ログにも例外メッセージにも出さない。
8. **`supabase db push` は AI セッションから実行できない**（Phase 1-2）。
9. **全削除→再挿入は絶対にしない**（`link` 単位の upsert と、期限切れ行の条件付き delete のみ）。過去に置換方式で実データを消した事故がある。
10. **`npm test`（vitest）は `scraper/` の Python テストを拾わない。** pytest は `scraper/` を作業ディレクトリにして別途回す。両方回すことを README に書く。
11. **PostgREST の一括 INSERT は、配列内の全オブジェクトのキー集合が完全一致していないと `PGRST102 All object keys must match` で 400**（2026-08-14 に実測）。「画像が取れなかった記事では `image_url` キーごと落とす」という自然な書き方がそのまま地雷になる。**省略可能な列は `null` を明示して全行で同じキー集合にする。** 巡回した記事にたまたま全部 OGP 画像があった回は成功し、1本でも無い回だけ全滅するので、**キー集合が揃っていない配列をテストに1本固定しておく**こと。`collected_at` のような DEFAULT 付きの列も同じ。
12. **`supabase gen types` は `__InternalSupabase`（`PostgrestVersion`）ブロックを出力しない**（CLI 2.114.0 で実測）。生成物でファイルを丸ごと置き換えると既存の記述が黙って消える。**一時ファイルに出して diff を取り、必要な差分だけを手で入れる。** PowerShell の `>` は CRLF で書き出すので、その意味でも全置換は避ける。

## 7. ロールバック

Phase 4 まで `mf/news_scraping` を残しておけば、そこのコミットを1つも触らずにタスクを再登録するだけで元の姿に戻る（欠けるのは停止中に出た記事だけ）。`articles` テーブルは残っていても害がないので急いで消さない。

## 8. 未決・要判断

- **`/news` は「毎日使う面」か。** monocore は面を増やす基準を「動いた」ではなく「使われ続けた」に置いており、作って使われず消した面が既に4つある（旧 projects / tasks / knowledge / 要注意タスクパネル）。今回は「LAN 内でしか読めないものをスマホに出す」ので利用は増える側に賭けられるが、判定は運用後。**移行の1〜2週間後に実際に開いたかを確認する。**
- **テーブル名は `articles`。** 面の名前（`/news`）とは一致しないが、行の中身は記事であり `reports` / `schedules` と同じ「複数形の名詞」に収まる。異論があれば Phase 1 の前に決める（後からの改名は migration が1本増える）。
