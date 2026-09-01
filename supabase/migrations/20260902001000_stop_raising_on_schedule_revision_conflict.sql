-- =======================================================
-- 楽観ロックの競合で例外を投げるのをやめる（2026-09-02）
-- =======================================================
-- 2026-08-25 と 2026-09-01 の2度、`RAISE EXCEPTION ERRCODE '40001'` が毎秒数百行の
-- Postgres エラーログを生み、Disk IO 予算を枯渇させた。クライアント側の打ち切り
-- （720ca58）は「リロードされない古いタブ」には永久に届かないため、防止策として
-- 成立していなかった。ここで取り除くのは
--   「1クライアントがエラーログだけでインスタンスを飽和させられる」
-- という性質そのもの。
--
-- 競合時は書き込みを一切行わず、現在の revision を「-1 - current」で符号化して返す。
--   - エラーログが1行も出ない（Disk IO の増幅が消える）
--   - データは1行も書かない（2026-08-29 に予定を消した revision 巻き戻しとは違う）
--   - 修正前のクライアントもこれを成功とみなして dirty を落とすため、リトライを止める
--
-- 負で返す理由: revision は CHECK (revision >= 0) なので成功時の戻り値は必ず 1 以上。
-- 一方「現在値をそのまま返す」設計だと、競合相手が1回だけ書いた場合に
-- current == p_expected_revision + 1 となり、成功時の戻り値と完全に一致してしまう。
-- これは最も普通の競合なので、符号で分けないと呼び出し側が見分けられない。
-- =======================================================

CREATE OR REPLACE FUNCTION public.replace_schedules_for_day(
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

    -- 競合。例外を投げない（エラーログを書かせない）。書き込みも一切しない。
    -- 戻り値は必ず -1 以下になり、成功時（1 以上）と重ならない。
    IF p_expected_revision IS DISTINCT FROM v_current_revision THEN
        RETURN -1 - v_current_revision;
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
