-- -------------------------------------------------------
-- project_notes
--
-- /projects に置く自由記述欄の保存先。
--   card_slug が入っていれば「そのプロジェクトについて」
--   card_slug が NULL なら「板全体について」（新規プロジェクトの追加・クローズ指示・横断の方針）
--
-- 選択肢つきの回答（project_card_decision_answers）を置き換えるもの。
-- 2026-08-05の実測で、20件の回答のうち18件に自由記述が付き、12件が「別の選択」＝
-- 選択肢が答えの形に合っていなかった。問い自体を否定する回答が複数あったため、
-- 答えの形を先に決めない入力へ移行する。
--
-- 追記専用。UPDATE/DELETE のポリシーは意図的に作らない（履歴を壊さないため）。
-- 「修正」は新しい行を足すことで表現し、最新行を現在の内容として表示する。
--
-- 加算的マイグレーション。既存テーブルの変更・削除は行わない。
-- -------------------------------------------------------
BEGIN;

CREATE TABLE public.project_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL = 板全体への記述。カード削除時に道連れにしないので外部キーは張らない
    -- （カードは再生成で消えうるが、書いた文章は残すべき情報のため）。
    card_slug TEXT,
    body TEXT NOT NULL CHECK (length(btrim(body)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- taskbox 側が回収したら埋める。NULL = 未読。
    consumed_at TIMESTAMPTZ
);

ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select project notes"
ON public.project_notes
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert project notes"
ON public.project_notes
FOR INSERT
TO authenticated
WITH CHECK (true);

-- UPDATE / DELETE のポリシーは作らない = 認証済みでも改変・削除できない。
-- consumed_at を打つのは service_role（taskbox の回収スクリプト）のみ。

CREATE INDEX idx_project_notes_card_slug_created_at
    ON public.project_notes (card_slug, created_at DESC);
CREATE INDEX idx_project_notes_unconsumed
    ON public.project_notes (created_at) WHERE consumed_at IS NULL;

GRANT SELECT, INSERT ON public.project_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_notes TO service_role;

COMMIT;
