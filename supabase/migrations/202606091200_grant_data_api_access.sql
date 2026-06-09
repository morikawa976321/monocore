-- -------------------------------------------------------
-- Data API 明示 GRANT（Supabase 2026-10-30 以降の必須化に備える）
-- RLS ポリシーとセットで適用する。ログイン必須のため anon には付与しない。
-- -------------------------------------------------------

-- tasks
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO service_role;

-- schedules
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO service_role;

-- inboxes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inboxes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inboxes TO service_role;

-- projects
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO service_role;

-- knowledge
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge TO service_role;

-- RPC（authenticated は各作成マイグレーションで付与済み）
GRANT EXECUTE ON FUNCTION public.apply_due_task_unarchives() TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_schedules_for_day(timestamptz, timestamptz, jsonb) TO service_role;
