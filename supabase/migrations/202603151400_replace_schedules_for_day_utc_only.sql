-- -------------------------------------------------------
-- RPC: 指定日のスケジュールを一括置換（UTC のみ受け取り）
-- フロントで day_start_utc / day_end_utc と各 start_at / end_at を UTC に変換してから渡す。
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION replace_schedules_for_day(
  p_day_start_utc timestamptz,
  p_day_end_utc timestamptz,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_item jsonb;
  v_activity text;
  v_start_at timestamptz;
  v_end_at timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- その日のスケジュールを全削除（UTC 範囲で指定）
  DELETE FROM schedules
  WHERE user_id = v_user_id
    AND start_at >= p_day_start_utc
    AND start_at < p_day_end_utc;

  -- p_items を 1 件ずつ挿入（start_at / end_at はすでに UTC の ISO 文字列）
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_activity := v_item->>'activity';
    IF v_activity IS NULL OR v_activity = '' THEN
      CONTINUE;
    END IF;

    v_start_at := (v_item->>'start_at')::timestamptz;
    IF v_item->>'end_at' IS NOT NULL AND v_item->>'end_at' != '' THEN
      v_end_at := (v_item->>'end_at')::timestamptz;
    ELSE
      v_end_at := NULL;
    END IF;

    INSERT INTO schedules (user_id, activity, start_at, end_at)
    VALUES (v_user_id, v_activity, v_start_at, v_end_at);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION replace_schedules_for_day(timestamptz, timestamptz, jsonb) TO authenticated;
