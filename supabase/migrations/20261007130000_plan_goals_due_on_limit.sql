-- =======================================================
-- plan_goals の期日の上限と権限を、適用済みの本番へ当てる（2026-10-07）
-- =======================================================
-- 20261007120000_add_plan_goals.sql は、独立レビューの指摘（期日の上限 CHECK、anon の権限を外す
-- REVOKE/GRANT）を書き足す前の版が本番に適用された（このファイルを足したセッションとは別の
-- db push による）。適用済みの migration は再実行されないので、差分をここで当てる。
-- どちらの版が当たった DB でも同じ結果になるよう、何度流しても同じになる形で書く。
--
-- 上限の理由: 年の打ち間違い（9999 年）を一度保存すると、スケジュール画面と /plan が計算と描画で
-- 固まり、UI から直せなくなる。画面側の入力は今日から3年まで。
-- =======================================================

REVOKE ALL ON public.plan_goals FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_goals TO authenticated, service_role;

ALTER TABLE public.plan_goals DROP CONSTRAINT IF EXISTS plan_goals_due_on_check;
ALTER TABLE public.plan_goals ADD CONSTRAINT plan_goals_due_on_check CHECK (due_on < DATE '2100-01-01');
