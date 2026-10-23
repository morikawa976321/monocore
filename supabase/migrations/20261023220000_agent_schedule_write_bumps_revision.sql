-- =======================================================
-- AI(monocore スキル)の予定の書き込みでも、その日の版を確かめて進める(2026-10-23、monocore#1)
-- =======================================================
-- 旧 replace_schedules_for_day_as(p_user_id, p_day_start_utc, p_day_end_utc, p_items) は版(schedule_day_revisions)
-- を見も進めもしなかった。画面で同じ日を開いたままだと、画面側の保存が AI の書き込みを競合として検出できず、
-- 古い内容で黙って上書きしえた。逆に AI が日を読んでから書くまでの間に画面で編集された分も、AI が上書きしえた。
--
-- 新しい関数は画面用の replace_schedules_for_day と同じ手順にそろえる:
--   1. 日ごとの advisory lock(画面用・apply_default_schedules と同じ鍵)
--   2. p_expected_revision が渡されていれば今の版と比べ、違えば何も書かずに -1 - 今の版 を返す(例外は投げない。
--      2026-08/09 の 40001 ストームの教訓。20260902001000 の説明を参照)
--   3. その日の行を入れ直し(updated_by = 'agent')、版を +1 して新しい版を返す
-- p_expected_revision を省いた(NULL)ときは版を確かめずに書くが、版は進める(画面側の競合検出は効く)。
-- 日付(p_day_key)を引数で受けるのは、UTC の範囲から日付を割り出すにはタイムゾーンが要るため。
--
-- 引数が変わるので別の関数(オーバーロード)として足し、スキルを切り替えた後に旧版を消す(次の migration)。
-- service_role 専用。auth.uid() は service_role では NULL なので、利用者は p_user_id で受ける(docs/database.md)。
-- =======================================================

CREATE OR REPLACE FUNCTION public.replace_schedules_for_day_as(
    p_user_id UUID,
    p_day_key DATE,
    p_day_start_utc TIMESTAMPTZ,
    p_day_end_utc TIMESTAMPTZ,
    p_items JSONB,
    p_expected_revision BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_revision BIGINT;
    v_next_revision BIGINT;
    v_item JSONB;
    v_activity TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id is required';
    END IF;

    IF p_day_key IS NULL OR p_day_start_utc IS NULL OR p_day_end_utc IS NULL THEN
        RAISE EXCEPTION 'Day key and UTC range are required';
    END IF;

    IF p_day_start_utc >= p_day_end_utc THEN
        RAISE EXCEPTION 'Invalid UTC day range';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_user_id::TEXT || ':' || p_day_key::TEXT, 0)
    );

    INSERT INTO schedule_day_revisions (user_id, day_key)
    VALUES (p_user_id, p_day_key)
    ON CONFLICT (user_id, day_key) DO NOTHING;

    SELECT revision
    INTO v_current_revision
    FROM schedule_day_revisions
    WHERE user_id = p_user_id
      AND day_key = p_day_key
    FOR UPDATE;

    IF p_expected_revision IS NOT NULL AND p_expected_revision IS DISTINCT FROM v_current_revision THEN
        RETURN -1 - v_current_revision;
    END IF;

    DELETE FROM schedules
    WHERE user_id = p_user_id
      AND start_at >= p_day_start_utc
      AND start_at < p_day_end_utc;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_activity := v_item->>'activity';
        IF v_activity IS NULL OR v_activity = '' THEN
            CONTINUE;
        END IF;

        v_start_at := (v_item->>'start_at')::TIMESTAMPTZ;
        IF v_start_at < p_day_start_utc OR v_start_at >= p_day_end_utc THEN
            RAISE EXCEPTION 'Schedule item is outside the requested day';
        END IF;

        IF v_item->>'end_at' IS NOT NULL AND v_item->>'end_at' != '' THEN
            v_end_at := (v_item->>'end_at')::TIMESTAMPTZ;
        ELSE
            v_end_at := NULL;
        END IF;

        INSERT INTO schedules (user_id, activity, start_at, end_at, updated_by)
        VALUES (p_user_id, v_activity, v_start_at, v_end_at, 'agent');
    END LOOP;

    UPDATE schedule_day_revisions
    SET revision = revision + 1,
        updated_at = now()
    WHERE user_id = p_user_id
      AND day_key = p_day_key
    RETURNING revision INTO v_next_revision;

    RETURN v_next_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_schedules_for_day_as(UUID, DATE, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_schedules_for_day_as(UUID, DATE, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, BIGINT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_schedules_for_day_as(UUID, DATE, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, BIGINT) TO service_role;
