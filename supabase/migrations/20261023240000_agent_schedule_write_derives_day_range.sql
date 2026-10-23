-- =======================================================
-- AI 用の予定の書き込みで、その日の UTC の範囲を日付から RPC の中で計算する(2026-10-23、monocore#1)
-- =======================================================
-- 20261023220000 の版は日付(p_day_key)と UTC の範囲(p_day_start_utc / p_day_end_utc)を別々に受け、両者の
-- 対応を確かめていなかった。食い違った入力(日付 10/23・範囲は 10/25)を渡すと、10/25 の予定を書き換えながら
-- 10/23 の版だけを進め、10/25 を開いた画面の競合検出をすり抜けた(sol のレビューの指摘)。
--
-- この版は日付だけを受け、範囲は日付から計算する。タイムゾーンは引数で受けず Asia/Tokyo に固定する。
-- 日ごとの版(schedule_day_revisions)は、書き込む側がみな同じタイムゾーンで日を区切ることを前提にしている。
-- タイムゾーンを呼び出しごとに選べると、画面とずれた日の版で書けて競合検出をすり抜け、夏時間のある地域では
-- 午前0時が2回ある日の境目の解釈が呼び出し側(Python)と食い違う(sol の再レビューの指摘)。日本時間には
-- 夏時間が無い。画面は日をブラウザのタイムゾーンで区切る(src/lib/date の getDefaultTimezone)ので、日本時間の
-- ブラウザで使う前提がここにも入る。monocore スキルは Asia/Tokyo 以外では予定を書かない。
-- 手順(日ごとのロック → 期待する版を確かめる → 入れ直す → 版を +1)は 20261023220000 と同じ。
-- 6引数の版はスキルを切り替えた後の migration で消す(20261023250000)。
-- =======================================================

CREATE OR REPLACE FUNCTION public.replace_schedules_for_day_as(
    p_user_id UUID,
    p_day_key DATE,
    p_items JSONB,
    p_expected_revision BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_day_start_utc TIMESTAMPTZ;
    v_day_end_utc TIMESTAMPTZ;
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

    IF p_day_key IS NULL THEN
        RAISE EXCEPTION 'Day key is required';
    END IF;

    -- 日本時間の 0:00 から翌日の 0:00 まで(画面の localTimeToUtc と同じ区切り)。
    v_day_start_utc := p_day_key::TIMESTAMP AT TIME ZONE 'Asia/Tokyo';
    v_day_end_utc := (p_day_key + 1)::TIMESTAMP AT TIME ZONE 'Asia/Tokyo';

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
      AND start_at >= v_day_start_utc
      AND start_at < v_day_end_utc;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_activity := v_item->>'activity';
        IF v_activity IS NULL OR v_activity = '' THEN
            CONTINUE;
        END IF;

        v_start_at := (v_item->>'start_at')::TIMESTAMPTZ;
        IF v_start_at < v_day_start_utc OR v_start_at >= v_day_end_utc THEN
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

REVOKE ALL ON FUNCTION public.replace_schedules_for_day_as(UUID, DATE, JSONB, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_schedules_for_day_as(UUID, DATE, JSONB, BIGINT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_schedules_for_day_as(UUID, DATE, JSONB, BIGINT) TO service_role;
