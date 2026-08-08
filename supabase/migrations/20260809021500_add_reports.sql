-- -------------------------------------------------------
-- reports
--
-- /reports（レポート閲覧面）が描画する、mf/reports/*.md の
-- 読み取り専用ミラー。正は C:\Users\tm976\mf\reports\ 側のファイルであり、
-- ここへは scripts/upsert-reports.mjs が「集合の一致」（ローカルに無い
-- slugはdelete）でservice_role経由で同期するだけ。
-- そのため画面からの手入力（INSERT/UPDATE/DELETE）は許可しない。
--
-- 導出物は単一形式でのみ持つ方針（md/HTMLの二重持ちをしない）ため、
-- 本文はbody_htmlのみを保持しmarkdown原文は保存しない。
--
-- updated_at は同期時刻ではなく元ファイルの更新時刻をスクリプトが明示的に
-- 書き込む列なので、project_cards と違い updated_at 自動更新トリガーは
-- 意図的に付けない（付けるとupsertのたびに同期時刻で上書きされてしまう）。
--
-- 加算的マイグレーション。既存テーブルの変更・削除は行わない。
-- -------------------------------------------------------
BEGIN;

CREATE TABLE public.reports (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body_html TEXT NOT NULL,
    -- [{level, text, anchor}, ...]。本文と同じASTから抽出したもの。
    toc JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- 元ファイル（mf/reports/*.md）の更新時刻。同期を実行した時刻ではない。
    updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 読み取りのみ許可する。書き込み用ポリシーは意図的に一切作らない。
-- service_role は RLS を迂回するため、投入スクリプトはポリシー無しでも書ける。
CREATE POLICY "Authenticated users can select reports"
ON public.reports
FOR SELECT
TO authenticated
USING (true);

-- 一覧は updated_at 降順で並べるため。
CREATE INDEX idx_reports_updated_at
    ON public.reports (updated_at DESC);

-- Data API 明示付与。anon には一切与えない（既存テーブルと同じ流儀）。
-- authenticated は SELECT のみ＝画面からの書き込みはテーブル権限の段階で拒否される。
-- service_role には DELETE も含めて付与する（同期スクリプトが集合の一致のため
-- ローカルに無い行を削除するので、project_cards と異なりDELETEを実際に使う）。
GRANT SELECT ON public.reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO service_role;

COMMIT;
