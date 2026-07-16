-- -------------------------------------------------------
-- M1: AI編集権(v2設計ドラフト §3・§4 Phase 1)
--   1. 全リソーステーブルに updated_by を追加(AI編集の監査可能性)
--   2. service_role 専用の予定一括置換RPCを新設
-- 加算的マイグレーション(既存データへの UPDATE / DELETE は行わない)。
-- -------------------------------------------------------

-- -------------------------------------------------------
-- 1. updated_by: 最後に書いたのが人間(user)かAI(agent)かを記録する。
--    既存行は DEFAULT 'user' でバックフィルされる(全て人間の手入力のため)。
-- -------------------------------------------------------
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS updated_by TEXT NOT NULL DEFAULT 'user'
  CHECK (updated_by IN ('user', 'agent'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_by TEXT NOT NULL DEFAULT 'user'
  CHECK (updated_by IN ('user', 'agent'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_by TEXT NOT NULL DEFAULT 'user'
  CHECK (updated_by IN ('user', 'agent'));
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS updated_by TEXT NOT NULL DEFAULT 'user'
  CHECK (updated_by IN ('user', 'agent'));

-- -------------------------------------------------------
-- 2. RPC: 指定日のスケジュールを一括置換（service_role 専用 / UTC のみ受け取り）
--
-- なぜ既存の replace_schedules_for_day と別に必要か:
--   既存RPCは本体で auth.uid() を要求するが、service_role の JWT には `sub` が無いため
--   auth.uid() は必ず NULL になり 'Not authenticated' で弾かれる(2026-07-17 実機で確認)。
--   AI(ローカルClaudeセッション)は service_role key で接続するため、
--   呼び出し元が対象ユーザーを引数で明示する版を用意する。
--   既存 replace_schedules_for_day(ユーザーセッション用)は一切変更しない。
--
-- 挙動は既存RPCと同一(当日分を UTC 範囲で削除 → p_items を再挿入するアトミックな置換)。
-- 差分は (a) auth.uid() ではなく p_user_id を使う (b) 挿入行に updated_by='agent' を付ける の2点のみ。
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION replace_schedules_for_day_as(
  p_user_id uuid,
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
  v_item jsonb;
  v_activity text;
  v_start_at timestamptz;
  v_end_at timestamptz;
BEGIN
  -- 対象ユーザーは呼び出し元(service_role)の責任で明示する。
  -- 取り違えると他人の予定を消すため、NULL は必ず弾く。
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  -- その日のスケジュールを全削除（UTC 範囲で指定）
  DELETE FROM schedules
  WHERE user_id = p_user_id
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

    INSERT INTO schedules (user_id, activity, start_at, end_at, updated_by)
    VALUES (p_user_id, v_activity, v_start_at, v_end_at, 'agent');
  END LOOP;
END;
$$;

-- -------------------------------------------------------
-- 【必須・セキュリティ】この関数は SECURITY DEFINER かつ対象ユーザーを引数で受け取り、
-- 内部に認証チェックが無い。PostgreSQL は新規関数の EXECUTE を既定で PUBLIC に付与するため、
-- REVOKE を省くと anon(未ログインのブラウザクライアント)が
-- 「任意のユーザーの任意の日の予定を全削除して差し替える」ことができてしまう。
-- 既存RPCは本体の auth.uid() チェックが最後の砦になっているが、本関数にはそれが無い。
-- したがって PUBLIC から剥奪した上で service_role にのみ付与する。
-- -------------------------------------------------------
REVOKE ALL ON FUNCTION public.replace_schedules_for_day_as(uuid, timestamptz, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_schedules_for_day_as(uuid, timestamptz, timestamptz, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_schedules_for_day_as(uuid, timestamptz, timestamptz, jsonb) TO service_role;
