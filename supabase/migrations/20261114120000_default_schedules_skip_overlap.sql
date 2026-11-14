-- =======================================================
-- 既定予定は、既にある予定と時間が重なるなら書かない（2026-11-14）
-- =======================================================
-- 本人の指定で、予定の板は「他の予定と時間が重なる行がある日」を Invalid にして保存しない
-- （src/lib/schedules/text-format.ts の findDayContentIssues の overlap、monocore.py の
-- schedules add も同じ規則）。
--
-- apply_default_schedules は画面が日を読み込む直前に既定予定を実データとして書く。先に
-- 入れてあった予定（たとえば旅行中の 19:00-22:00 の予定）と既定予定（夕食 19:00-20:00）が
-- 重なると、本人が何もしていないのにその日が Invalid になり、直すまで編集を保存できなく
-- なる。だから重なる既定予定は書かない。
--
-- - 書き込み済みの印（default_schedule_applications）は重なっても付ける。付けないと、
--   その予定を後から動かした日に次の読み込みで既定予定が現れて、また重なる。
-- - 比べるのは、いま schedules にある行（この関数の文の前から在る行）。同じ文で書く既定予定
--   どうしは見えない。既定予定どうしが重ならないことは、本人が `defaults add` で入れるとき
--   の責任（今の3件は重ならない）。
-- - 重なりの定義は板と同じ半開区間 [開始, 終了)。終了の無い行（起床）と、長さが 0 以下の行は
--   比べない。接する（終了 = 開始）のは重ならない。
-- - 重ならなかった既定予定の扱いは変えない（同じ activity・開始が既にある日は足さない、
--   足した日の版を進める、日ごとのロック）。
CREATE OR REPLACE FUNCTION public.apply_default_schedules(
    p_start_day DATE,
    p_end_day DATE,
    p_timezone TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_day DATE;
    v_inserted INTEGER;
    v_changed_days INTEGER := 0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_start_day IS NULL OR p_end_day IS NULL OR p_timezone IS NULL THEN
        RAISE EXCEPTION 'Day range and timezone are required';
    END IF;

    -- 画面の一度の読み込みは最大でも数ヶ月。桁違いの範囲は呼び出し側の誤りとして止める。
    IF p_end_day < p_start_day OR p_end_day - p_start_day > 400 THEN
        RAISE EXCEPTION 'Invalid day range';
    END IF;

    FOR v_day IN
        SELECT DISTINCT d.day::date
        FROM generate_series(p_start_day, p_end_day, interval '1 day') AS d(day)
        JOIN default_schedules ds
          ON ds.user_id = v_user_id
         AND ds.effective_from <= d.day::date
        WHERE NOT EXISTS (
            SELECT 1
            FROM default_schedule_applications a
            WHERE a.default_schedule_id = ds.id
              AND a.day_key = d.day::date
        )
        ORDER BY 1
    LOOP
        PERFORM pg_advisory_xact_lock(
            hashtextextended(v_user_id::TEXT || ':' || v_day::TEXT, 0)
        );

        WITH pending AS (
            SELECT
                ds.id,
                ds.activity,
                (v_day + ds.start_time) AT TIME ZONE p_timezone AS start_at,
                CASE
                    WHEN ds.end_time IS NULL THEN NULL
                    WHEN ds.end_time > ds.start_time THEN (v_day + ds.end_time) AT TIME ZONE p_timezone
                    ELSE ((v_day + 1) + ds.end_time) AT TIME ZONE p_timezone
                END AS end_at
            FROM default_schedules ds
            WHERE ds.user_id = v_user_id
              AND ds.effective_from <= v_day
              AND NOT EXISTS (
                  SELECT 1
                  FROM default_schedule_applications a
                  WHERE a.default_schedule_id = ds.id
                    AND a.day_key = v_day
              )
        ),
        marked AS (
            INSERT INTO default_schedule_applications (user_id, default_schedule_id, day_key)
            SELECT v_user_id, p.id, v_day
            FROM pending p
            ON CONFLICT DO NOTHING
            RETURNING default_schedule_id
        ),
        inserted AS (
            INSERT INTO schedules (user_id, activity, start_at, end_at)
            SELECT v_user_id, p.activity, p.start_at, p.end_at
            FROM pending p
            JOIN marked m ON m.default_schedule_id = p.id
            WHERE NOT EXISTS (
                SELECT 1
                FROM schedules s
                WHERE s.user_id = v_user_id
                  AND s.activity = p.activity
                  AND s.start_at = p.start_at
            )
              AND NOT (
                  p.end_at IS NOT NULL
                  AND p.end_at > p.start_at
                  AND EXISTS (
                      SELECT 1
                      FROM schedules s
                      WHERE s.user_id = v_user_id
                        AND s.end_at IS NOT NULL
                        AND s.end_at > s.start_at
                        AND s.start_at < p.end_at
                        AND p.start_at < s.end_at
                  )
              )
            RETURNING 1
        )
        SELECT count(*) INTO v_inserted FROM inserted;

        IF v_inserted > 0 THEN
            INSERT INTO schedule_day_revisions (user_id, day_key, revision)
            VALUES (v_user_id, v_day, 1)
            ON CONFLICT (user_id, day_key) DO UPDATE
            SET revision = schedule_day_revisions.revision + 1,
                updated_at = now();
            v_changed_days := v_changed_days + 1;
        END IF;
    END LOOP;

    RETURN v_changed_days;
END;
$$;
