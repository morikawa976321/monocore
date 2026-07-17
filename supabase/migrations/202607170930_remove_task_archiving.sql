-- タスクのアーカイブ機能を廃止する。
-- 既存のアーカイブ済みタスクは、データを失わないよう未完了へ戻す。
BEGIN;

DROP FUNCTION IF EXISTS public.apply_due_task_unarchives();

UPDATE public.tasks
SET status = 'waiting'
WHERE status = 'archived';

DROP INDEX IF EXISTS public.idx_tasks_user_id_unarchive_at;

ALTER TABLE public.tasks
    DROP CONSTRAINT IF EXISTS tasks_status_check,
    DROP COLUMN IF EXISTS unarchive_at;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_status_check
    CHECK (status IN ('waiting', 'completed', 'deleted'));

COMMIT;
