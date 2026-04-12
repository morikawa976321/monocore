-- -------------------------------------------------------
-- RPC: 期限到来済みのアーカイブタスクを未完了へ戻す（DB の now() 基準）
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_due_task_unarchives()
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE tasks
  SET
    status = 'waiting',
    unarchive_at = NULL
  WHERE user_id = auth.uid()
    AND status = 'archived'
    AND unarchive_at IS NOT NULL
    AND unarchive_at <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_due_task_unarchives() TO authenticated;
