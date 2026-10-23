-- -------------------------------------------------------
-- 日付と UTC の範囲を別々に受ける replace_schedules_for_day_as(6引数)を消す(2026-10-23、monocore#1)
--
-- 範囲を日付とタイムゾーンから計算する版(20261023240000)に monocore スキルを切り替えた後に消す。残すと、
-- 日付と範囲が食い違った入力で版の付いていない日を書き換える経路が残る(sol のレビューの指摘)。
-- -------------------------------------------------------
DROP FUNCTION IF EXISTS public.replace_schedules_for_day_as(UUID, DATE, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, BIGINT);
