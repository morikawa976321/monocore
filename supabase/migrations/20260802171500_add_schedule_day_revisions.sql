BEGIN;

CREATE TABLE public.schedule_day_revisions (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    day_key DATE NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day_key)
);

ALTER TABLE public.schedule_day_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own schedule revisions"
ON public.schedule_day_revisions
FOR SELECT
USING (auth.uid() = user_id);

GRANT SELECT ON public.schedule_day_revisions TO authenticated, service_role;

DROP FUNCTION public.replace_schedules_for_day(timestamptz, timestamptz, jsonb);

CREATE FUNCTION public.replace_schedules_for_day(
    p_day_key DATE,
    p_day_start_utc TIMESTAMPTZ,
    p_day_end_utc TIMESTAMPTZ,
    p_expected_revision BIGINT,
    p_items JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_current_revision BIGINT;
    v_next_revision BIGINT;
    v_item JSONB;
    v_activity TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_day_key IS NULL OR p_day_start_utc IS NULL OR p_day_end_utc IS NULL THEN
        RAISE EXCEPTION 'Day key and UTC range are required';
    END IF;

    IF p_day_start_utc >= p_day_end_utc THEN
        RAISE EXCEPTION 'Invalid UTC day range';
    END IF;

    -- 同じユーザー・同じローカル日への置換をトランザクション単位で直列化する。
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_user_id::TEXT || ':' || p_day_key::TEXT, 0)
    );

    INSERT INTO schedule_day_revisions (user_id, day_key)
    VALUES (v_user_id, p_day_key)
    ON CONFLICT (user_id, day_key) DO NOTHING;

    SELECT revision
    INTO v_current_revision
    FROM schedule_day_revisions
    WHERE user_id = v_user_id
      AND day_key = p_day_key
    FOR UPDATE;

    IF p_expected_revision IS DISTINCT FROM v_current_revision THEN
        RAISE EXCEPTION USING
            ERRCODE = '40001',
            MESSAGE = format(
                'Schedule revision conflict for %s: expected %s, current %s',
                p_day_key,
                p_expected_revision,
                v_current_revision
            );
    END IF;

    DELETE FROM schedules
    WHERE user_id = v_user_id
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

        INSERT INTO schedules (user_id, activity, start_at, end_at)
        VALUES (v_user_id, v_activity, v_start_at, v_end_at);
    END LOOP;

    UPDATE schedule_day_revisions
    SET revision = revision + 1,
        updated_at = now()
    WHERE user_id = v_user_id
      AND day_key = p_day_key
    RETURNING revision INTO v_next_revision;

    RETURN v_next_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_schedules_for_day(
    date,
    timestamptz,
    timestamptz,
    bigint,
    jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.replace_schedules_for_day(
    date,
    timestamptz,
    timestamptz,
    bigint,
    jsonb
) TO authenticated, service_role;

COMMIT;
