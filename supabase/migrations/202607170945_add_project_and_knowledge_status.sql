-- projects / knowledge を tasks と同じ status ベースの状態管理へ移行する。
-- 既存の deleted_at は deleted status と status_changed_at に引き継ぐ。
BEGIN;

ALTER TABLE public.projects
    ADD COLUMN status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN status_changed_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.knowledge
    ADD COLUMN status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN status_changed_at TIMESTAMPTZ DEFAULT now();

UPDATE public.projects
SET status = 'deleted',
    status_changed_at = COALESCE(deleted_at, updated_at, created_at, now())
WHERE deleted_at IS NOT NULL;

UPDATE public.knowledge
SET status = 'deleted',
    status_changed_at = COALESCE(deleted_at, updated_at, created_at, now())
WHERE deleted_at IS NOT NULL;

ALTER TABLE public.projects
    ADD CONSTRAINT projects_status_check
    CHECK (status IN ('active', 'completed', 'deleted'));

ALTER TABLE public.knowledge
    ADD CONSTRAINT knowledge_status_check
    CHECK (status IN ('active', 'completed', 'deleted'));

CREATE TRIGGER update_projects_status_changed_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.update_status_changed_at_column();

CREATE TRIGGER update_knowledge_status_changed_at
    BEFORE UPDATE ON public.knowledge
    FOR EACH ROW
    EXECUTE FUNCTION public.update_status_changed_at_column();

DROP INDEX IF EXISTS public.idx_projects_user_id_updated_at_active;
DROP INDEX IF EXISTS public.idx_knowledge_user_id_updated_at_active;
DROP INDEX IF EXISTS public.idx_projects_user_id_sort_order_active;
DROP INDEX IF EXISTS public.idx_knowledge_user_id_sort_order_active;

CREATE INDEX idx_projects_user_id_status_sort_order
    ON public.projects (user_id, status, sort_order);

CREATE INDEX idx_knowledge_user_id_status_sort_order
    ON public.knowledge (user_id, status, sort_order);

-- 新規行を同じ user・status の先頭へ置く。
CREATE OR REPLACE FUNCTION public.set_resource_sort_order_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    min_order INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'projects' THEN
        SELECT MIN(sort_order) INTO min_order
        FROM public.projects
        WHERE user_id = NEW.user_id
          AND status = NEW.status;
    ELSIF TG_TABLE_NAME = 'knowledge' THEN
        SELECT MIN(sort_order) INTO min_order
        FROM public.knowledge
        WHERE user_id = NEW.user_id
          AND status = NEW.status;
    END IF;

    NEW.sort_order := COALESCE(min_order, 0) - 1;
    RETURN NEW;
END;
$$;

ALTER TABLE public.projects DROP COLUMN deleted_at;
ALTER TABLE public.knowledge DROP COLUMN deleted_at;

COMMIT;
