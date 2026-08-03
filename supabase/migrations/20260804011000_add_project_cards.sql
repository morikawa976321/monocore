-- -------------------------------------------------------
-- project_cards
--
-- /projects（プロジェクト板）が描画するカードの格納先。
-- このテーブルは「導出物の置き場」であって台帳ではない。正は
-- context-engine の個別ノートと taskbox/projects.md 側にあり、
-- ここへは taskbox 側のスクリプトが slug 単位で upsert するだけ。
-- そのため画面からの手入力（INSERT/UPDATE/DELETE）は許可しない。
--
-- 加算的マイグレーション。既存テーブルの変更・削除は行わない。
-- -------------------------------------------------------
BEGIN;

CREATE TABLE public.project_cards (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    definition_of_done TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'waiting_user', 'waiting_other', 'dormant')),
    deadline DATE,
    deadline_note TEXT,
    -- {"text": "...", "links": ["reports/..."]}。AIが何もしていなければ空オブジェクト。
    ai_recent JSONB NOT NULL DEFAULT '{}'::jsonb,
    your_turn TEXT NOT NULL DEFAULT '',
    -- [{id, question, recommendation, first_raised, times_shown, blocks}, ...]
    decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- AI側の未着手作業（将来 queue に積める候補）
    ai_next JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- このカードの組み立てに実際に読んだファイルパス
    sources TEXT[] NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.project_cards ENABLE ROW LEVEL SECURITY;

-- 読み取りのみ許可する。書き込み用ポリシーは意図的に一切作らない。
-- service_role は RLS を迂回するため、投入スクリプトはポリシー無しでも書ける。
CREATE POLICY "Authenticated users can select project cards"
ON public.project_cards
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX idx_project_cards_status_sort_order
    ON public.project_cards (status, sort_order);

CREATE TRIGGER update_project_cards_updated_at
    BEFORE UPDATE ON public.project_cards
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Data API 明示付与。anon には一切与えない（既存テーブルと同じ流儀）。
-- authenticated は SELECT のみ＝画面からの書き込みはテーブル権限の段階で拒否される。
GRANT SELECT ON public.project_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_cards TO service_role;

COMMIT;
