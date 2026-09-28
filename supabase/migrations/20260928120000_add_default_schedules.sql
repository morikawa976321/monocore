-- =======================================================
-- 既定予定（毎日入る予定のテンプレート）（2026-09-28）
-- =======================================================
-- 本人の要望は「UIから見たすべての日に自動で入っていてほしい」。
--
-- 表示時に仮想的に重ねるのではなく、画面が日を読み込む直前に apply_default_schedules で
-- schedules へ実データとして書き込む。仮想方式だと、その日だけ既定予定を消す・時刻を
-- ずらすたびに「例外」を別に持つ必要があり、テキスト1枚で日を丸ごと置換する保存経路
-- （replace_schedules_for_day）と噛み合わない。書き込み済みなら通常の予定と区別が無い。
--
-- 書き込んだ (既定予定, 日) は default_schedule_applications に残す。これが無いと、本人が
-- その日の既定予定を消しても次の読み込みで復活する。
--
-- effective_from より前の日には入れない。過去の日へ遡って入れると、過去方向の無限
-- スクロールが「予定もメモも無い月」で止まる条件（useSchedules の loadMorePast）が
-- 永久に成立しなくなるうえ、記録として残っている過去の日を書き換えることになる。
-- =======================================================

CREATE TABLE public.default_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    activity TEXT NOT NULL CHECK (activity <> ''),
    -- 時刻は利用者のローカル時刻。UTC への変換は apply_default_schedules が p_timezone で行う。
    start_time TIME NOT NULL,
    -- start_time 以下なら翌日の時刻とみなす（23:30-00:30 のような日跨ぎ）。
    end_time TIME,
    effective_from DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Tokyo')::date,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.default_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own default schedules" ON public.default_schedules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own default schedules" ON public.default_schedules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own default schedules" ON public.default_schedules FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own default schedules" ON public.default_schedules FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_default_schedules_user_id ON public.default_schedules (user_id);

CREATE TRIGGER update_default_schedules_updated_at
    BEFORE UPDATE ON public.default_schedules
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.default_schedule_applications (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    default_schedule_id UUID NOT NULL REFERENCES public.default_schedules(id) ON DELETE CASCADE,
    day_key DATE NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (default_schedule_id, day_key)
);

ALTER TABLE public.default_schedule_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own default schedule applications"
ON public.default_schedule_applications
FOR SELECT
USING (auth.uid() = user_id);

-- =======================================================
-- apply_default_schedules
-- =======================================================
-- p_start_day〜p_end_day（両端含む、ローカル日付）のうち、まだ書き込んでいない既定予定を
-- 書き込み、予定を1件以上足した日の数を返す。
--
-- - 同じ activity・同じ開始時刻の予定が既にある日には足さない（書き込み済みの印だけ付ける）。
--   既定予定を決める前に本人が手で入れていた「07:00 起床」を二重にしないため。
-- - 足した日は schedule_day_revisions を進める。進めないと、その日を開いたままの別タブが
--   古い本文で保存したとき、楽観ロックを素通りして既定予定を黙って消す。
-- - 日単位のロックは replace_schedules_for_day と同じキーで取る（同じ日の保存と直列化する）。
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

-- =======================================================
-- GRANT
-- =======================================================
REVOKE ALL ON public.default_schedules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.default_schedules TO authenticated, service_role;

REVOKE ALL ON public.default_schedule_applications FROM PUBLIC, anon;
GRANT SELECT ON public.default_schedule_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.default_schedule_applications TO service_role;

REVOKE ALL ON FUNCTION public.apply_default_schedules(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_default_schedules(date, date, text) TO authenticated;
