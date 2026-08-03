-- -------------------------------------------------------
-- project_card_decision_answers
--
-- /projects のカードに並ぶ「判断」への回答を追記専用で貯める。
--
-- project_cards.decisions のjsonbを読み書きして更新する方式は取らない。
-- 理由は2つ: ①カードは taskbox 側のupsertが上書きするため、画面からの
-- 書き込みと衝突する ②回答の履歴を監査可能に保つ。
--
-- 権限モデルは project_cards と逆向きである点に注意:
--   project_cards                  … 書き込みは service_role のみ（AIが描画用に投入する）
--   project_card_decision_answers  … 書き込みは authenticated のみ（本人が画面から答える）
-- UPDATE/DELETE はどちらのロールにも与えない（追記専用）。
-- consumed_at の更新は RLS を迂回する service_role（taskbox側の回収）だけが行う。
--
-- 加算的マイグレーション。既存テーブルの変更・削除は行わない。
-- -------------------------------------------------------
BEGIN;

CREATE TABLE public.project_card_decision_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- カードが消えても回答は残すべきなので ON DELETE は既定(NO ACTION)。
    -- 回答が付いたカードは削除できなくなるが、投入経路はupsertのみで削除しない。
    card_slug TEXT NOT NULL REFERENCES public.project_cards(slug),
    decision_id TEXT NOT NULL,
    answer TEXT NOT NULL CHECK (answer IN ('accept_recommendation', 'alternative', 'defer')),
    note TEXT,
    answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- taskbox側が回収したら埋める。NULL = 未読。
    consumed_at TIMESTAMPTZ
);

ALTER TABLE public.project_card_decision_answers ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは自分の回答を読める。
CREATE POLICY "Authenticated users can select decision answers"
ON public.project_card_decision_answers
FOR SELECT
TO authenticated
USING (true);

-- 認証済みユーザーは回答を追記できる。UPDATE/DELETE用のポリシーは意図的に作らない。
CREATE POLICY "Authenticated users can insert decision answers"
ON public.project_card_decision_answers
FOR INSERT
TO authenticated
WITH CHECK (true);

-- カード表示時に「この判断は回答済みか」を引くための索引。
CREATE INDEX idx_pcda_card_slug_decision_id
    ON public.project_card_decision_answers (card_slug, decision_id);

-- taskbox側が未読の回答だけを拾うための部分索引。
CREATE INDEX idx_pcda_unconsumed
    ON public.project_card_decision_answers (answered_at)
    WHERE consumed_at IS NULL;

-- Data API 明示付与。anon には一切与えない。
-- authenticated に UPDATE/DELETE を与えないことで、追記専用をテーブル権限の段階でも担保する。
GRANT SELECT, INSERT ON public.project_card_decision_answers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_card_decision_answers TO service_role;

COMMIT;
