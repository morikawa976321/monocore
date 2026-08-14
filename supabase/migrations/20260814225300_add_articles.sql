-- -------------------------------------------------------
-- articles — RSS から収集したニュース記事1本につき1行
--
-- 投入経路: monocore/scraper（Python・タスクスケジューラが毎時起動）が
-- link 単位で upsert し、保持期間(config.json の max_age_days = 8日)を過ぎた行を
-- 自分で delete する。画面(/news)からは SELECT のみ。
--
-- 正の所在が既存3テーブルと違う。reports / project_cards / drain_runs は
-- 「消えても再生成できる導出物」だが、RSS は過去記事を配らないので
-- articles は消えたら戻らない。したがって正はこのテーブル自身にある
-- （ローカルにコピーを持たない。旧 static/articles.jsonl は廃止）。
-- 保持8日を選んだので、失われうる最大値は「8日以内に読み逃した記事」であり、
-- バックアップは持たない(2026-08-14・本人判断)。
--
-- collected_at を持つ理由: RSS に published が無い記事があり、旧実装
-- (truncate_articles_json)は日付が空の行を消さなかった。同じ実装のまま DB に
-- 移すと NULL 行が永久に残るので、削除条件を
-- COALESCE(published, collected_at) < threshold にするための列である。
-- -------------------------------------------------------
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
ON public.articles
FOR SELECT
TO authenticated
USING (true);

-- 一覧は published の新しい順。published が無い記事は末尾に置く。
CREATE INDEX idx_articles_published
    ON public.articles (published DESC NULLS LAST);

-- 期限切れ削除は published が NULL の行を collected_at で判定するため、
-- そちらにも索引を張る(行数は数百〜数千で、無くても効くが将来のため)。
CREATE INDEX idx_articles_collected_at
    ON public.articles (collected_at);

GRANT SELECT ON public.articles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO service_role;
