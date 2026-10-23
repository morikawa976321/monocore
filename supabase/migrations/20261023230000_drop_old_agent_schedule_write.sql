-- -------------------------------------------------------
-- 版を見ない旧 replace_schedules_for_day_as(4引数)を消す(2026-10-23、monocore#1)
--
-- 新しい版(日付と期待する版を受け、版を進める。20261023220000)に monocore スキルを切り替えた後に消す
-- (スキルのコミット cddc7df、~/.claude リポジトリ)。旧版を残すと、版を進めない書き込みの経路が残る。
-- 消す前に mf 配下とスキルで旧版の呼び出しが無いことを確かめた。
-- -------------------------------------------------------
DROP FUNCTION IF EXISTS public.replace_schedules_for_day_as(UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB);
