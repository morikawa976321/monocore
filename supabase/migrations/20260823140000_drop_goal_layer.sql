-- 目標分類（goals テーブル / project_cards.goal_slug）を撤去する。
-- 本人指示（2026-08-23）: 生きているカードのほとんどが「ものづくり」に偏り、
-- 5目標への分類が実質機能していなかった。目標を5つ同時に抱えられるほどの
-- キャパシティが無いと自覚しながら分類してしまったこと自体を過剰な複雑性と
-- 判断し、目標層をテーブルごと削除する。
--
-- goal-layer-ratified（2026-08-06批准）と、その一部撤回だった
-- goalless-project-cards-not-allowed（2026-08-14）を、まとめて撤回する。
--
-- DROP COLUMN は FK（project_cards_goal_slug_fkey）と
-- idx_project_cards_goal_slug を道連れに落とす。DROP TABLE は
-- goals 自身の RLS policy・index・trigger・grant を道連れに落とす。
ALTER TABLE public.project_cards DROP COLUMN goal_slug;
DROP TABLE public.goals;
