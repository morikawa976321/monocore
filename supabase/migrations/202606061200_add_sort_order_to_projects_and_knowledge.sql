-- -------------------------------------------------------
-- projects / knowledge: ユーザー定義の一覧順（sort_order 昇順）
-- -------------------------------------------------------

ALTER TABLE projects ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 既存行: updated_at DESC 相当を sort_order 0..n-1 にバックフィル（active / deleted は user 内で独立）
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id, (deleted_at IS NULL)
               ORDER BY updated_at DESC
           ) - 1 AS rn
    FROM projects
)
UPDATE projects p
SET sort_order = r.rn
FROM ranked r
WHERE p.id = r.id;

WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY user_id, (deleted_at IS NULL)
               ORDER BY updated_at DESC
           ) - 1 AS rn
    FROM knowledge
)
UPDATE knowledge k
SET sort_order = r.rn
FROM ranked r
WHERE k.id = r.id;

CREATE INDEX IF NOT EXISTS idx_projects_user_id_sort_order_active
    ON projects (user_id, sort_order)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_user_id_sort_order_active
    ON knowledge (user_id, sort_order)
    WHERE deleted_at IS NULL;

-- 新規 INSERT 時: 同一 user・同一 deleted 状態の先頭（MIN - 1）へ
CREATE OR REPLACE FUNCTION set_resource_sort_order_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    min_order INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'projects' THEN
        SELECT MIN(sort_order) INTO min_order
        FROM projects
        WHERE user_id = NEW.user_id
          AND deleted_at IS NOT DISTINCT FROM NEW.deleted_at;
    ELSIF TG_TABLE_NAME = 'knowledge' THEN
        SELECT MIN(sort_order) INTO min_order
        FROM knowledge
        WHERE user_id = NEW.user_id
          AND deleted_at IS NOT DISTINCT FROM NEW.deleted_at;
    END IF;

    NEW.sort_order := COALESCE(min_order, 0) - 1;
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_projects_sort_order_on_insert
    BEFORE INSERT ON projects
    FOR EACH ROW
    EXECUTE FUNCTION set_resource_sort_order_on_insert();

CREATE TRIGGER set_knowledge_sort_order_on_insert
    BEFORE INSERT ON knowledge
    FOR EACH ROW
    EXECUTE FUNCTION set_resource_sort_order_on_insert();
