-- -------------------------------------------------------
-- 目標層（goals）と、project_cards への goal_slug / collapsed の追加。
--
-- /projects を「目標見出し(5) → プロジェクトカード」の2層で描くための土台。
-- 目標は5つ固定（ものづくり/キャリア/健康/シンプルライフ/AI協働）で、
-- 正は context-engine の goal-layer-ratified ノート（2026-08-06 批准）。
-- 実体は目標とプロジェクトの2種のみで、タスク層・中間層は作らない。
--
-- goals も project_cards と同じく「導出物の置き場」であり画面からは書けない。
--
-- 加算的マイグレーション。既存テーブル・既存列の変更・削除は行わない。
-- 既存カードは goal_slug = NULL / collapsed = false で開始し、後続タスクが埋める。
-- -------------------------------------------------------
BEGIN;

CREATE TABLE public.goals (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select goals"
ON public.goals
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX idx_goals_sort_order ON public.goals (sort_order);

CREATE TRIGGER update_goals_updated_at
    BEFORE UPDATE ON public.goals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT ON public.goals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO service_role;

-- 目標5つのシード。slug は ASCII、表示順は sort_order。
INSERT INTO public.goals (slug, title, sort_order) VALUES
    ('monodukuri', 'ものづくり', 1),
    ('career', 'キャリア', 2),
    ('health', '健康', 3),
    ('simple-life', 'シンプルライフ', 4),
    ('ai-collab', 'AI協働', 5)
ON CONFLICT (slug) DO NOTHING;

-- 目標の改廃でカードを道連れにしないため ON DELETE SET NULL。
ALTER TABLE public.project_cards
    ADD COLUMN goal_slug TEXT
        REFERENCES public.goals (slug) ON DELETE SET NULL;

-- 月次計画で「スコープ内だけ展開、他は畳む」ための表示状態。
-- WIP上限の機械的強制ではないので、既定は展開（false）。
ALTER TABLE public.project_cards
    ADD COLUMN collapsed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_project_cards_goal_slug ON public.project_cards (goal_slug);

COMMIT;
