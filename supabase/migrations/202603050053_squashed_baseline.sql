-- -------------------------------------------------------
-- Squashed baseline schema (public)
--
-- これまでの個別マイグレーションを1本へ統合したもの。
-- 「作って後で消した」変更（tasks / knowledge / projects、
-- project_card_decision_answers、project_cards.collapsed / sources）は
-- 最終形のみを反映し、途中経過は含めない。
-- リモート本番の schema dump（backups/manual/pre-squash-20260811-035340）
-- とオブジェクト構成が一致することを前提とする。
-- -------------------------------------------------------
BEGIN;

-- =======================================================
-- 共通関数
-- =======================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- =======================================================
-- schedules
-- =======================================================
CREATE TABLE public.schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
    activity TEXT NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by TEXT NOT NULL DEFAULT 'user' CHECK (updated_by IN ('user', 'agent'))
);

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own schedules" ON public.schedules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own schedules" ON public.schedules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own schedules" ON public.schedules FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own schedules" ON public.schedules FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_schedules_user_id_start_at ON public.schedules (user_id, start_at);

CREATE TRIGGER update_schedules_updated_at
    BEFORE UPDATE ON public.schedules
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =======================================================
-- inboxes（ユーザーごとに1レコード）
-- =======================================================
CREATE TABLE public.inboxes (
    user_id UUID PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id),
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.inboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own inbox" ON public.inboxes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own inbox" ON public.inboxes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own inbox" ON public.inboxes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_inboxes_updated_at
    BEFORE UPDATE ON public.inboxes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =======================================================
-- schedule_day_revisions（日単位の楽観ロック）
-- =======================================================
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

-- =======================================================
-- schedule_day_notes（日別メモ）
-- =======================================================
CREATE TABLE public.schedule_day_notes (
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    day_key DATE NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day_key)
);

ALTER TABLE public.schedule_day_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own schedule day notes"
ON public.schedule_day_notes
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own schedule day notes"
ON public.schedule_day_notes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own schedule day notes"
ON public.schedule_day_notes
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_schedule_day_notes_updated_at
    BEFORE UPDATE ON public.schedule_day_notes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =======================================================
-- goals（導出物。画面からは SELECT のみ）
-- =======================================================
CREATE TABLE public.goals (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select goals"
ON public.goals
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX idx_goals_sort_order ON public.goals (sort_order);

CREATE TRIGGER update_goals_updated_at
    BEFORE UPDATE ON public.goals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.goals (slug, title, sort_order) VALUES
    ('monodukuri', 'ものづくり', 1),
    ('career', 'キャリア', 2),
    ('health', '健康', 3),
    ('simple-life', 'シンプルライフ', 4),
    ('ai-collab', 'AI協働', 5)
ON CONFLICT (slug) DO NOTHING;

-- =======================================================
-- project_cards（導出物。画面からは SELECT のみ）
-- =======================================================
CREATE TABLE public.project_cards (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    definition_of_done TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'waiting_user', 'waiting_other', 'dormant', 'done')),
    deadline DATE,
    deadline_note TEXT,
    ai_recent JSONB NOT NULL DEFAULT '{}'::jsonb,
    your_turn TEXT NOT NULL DEFAULT '',
    decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_next JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    goal_slug TEXT REFERENCES public.goals (slug) ON DELETE SET NULL
);

ALTER TABLE public.project_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select project cards"
ON public.project_cards
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX idx_project_cards_status_sort_order
    ON public.project_cards (status, sort_order);

CREATE INDEX idx_project_cards_goal_slug
    ON public.project_cards (goal_slug);

CREATE TRIGGER update_project_cards_updated_at
    BEFORE UPDATE ON public.project_cards
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =======================================================
-- project_notes（追記専用・カード単位のみ。card_slug 必須）
-- =======================================================
CREATE TABLE public.project_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- カード削除時に道連れにしないので外部キーは張らない
    card_slug TEXT NOT NULL,
    body TEXT NOT NULL CHECK (length(btrim(body)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_at TIMESTAMPTZ
);

ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select project notes"
ON public.project_notes
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert project notes"
ON public.project_notes
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE INDEX idx_project_notes_card_slug_created_at
    ON public.project_notes (card_slug, created_at DESC);

CREATE INDEX idx_project_notes_unconsumed
    ON public.project_notes (created_at) WHERE consumed_at IS NULL;

-- =======================================================
-- reports（導出物。画面からは SELECT のみ）
-- =======================================================
CREATE TABLE public.reports (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body_html TEXT NOT NULL,
    toc JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select reports"
ON public.reports
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX idx_reports_updated_at
    ON public.reports (updated_at DESC);

-- =======================================================
-- RPC: 指定日のスケジュールを一括置換（ユーザーセッション用）
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

-- =======================================================
-- RPC: 指定日のスケジュールを一括置換（service_role 専用）
--
-- p_user_id を引数で受けるのは、service_role の JWT に sub が無く auth.uid() が
-- NULL になるため（上の replace_schedules_for_day は service_role から呼ぶと
-- 'Not authenticated' で落ちる）。認証チェックを持たない SECURITY DEFINER 関数なので、
-- Postgres 既定の PUBLIC EXECUTE のままだと anon が任意ユーザーの予定を破壊できる。
-- 末尾の REVOKE ... FROM PUBLIC, anon, authenticated → GRANT ... TO service_role が
-- 必須で、同種の service_role 専用 RPC を足すときも同じ REVOKE を付けること
-- （本番で anon/publishable key が 401 になることを 2026-07-17 に実機確認）。
-- 空配列を渡すとその日を全削除する。疎通確認に実呼び出しを使わない（docs/database.md §5）。
-- =======================================================
CREATE OR REPLACE FUNCTION public.replace_schedules_for_day_as(
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
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
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

-- =======================================================
-- GRANT（Data API 明示付与 / RPC 実行権限）
-- =======================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inboxes TO authenticated, service_role;
GRANT SELECT ON public.schedule_day_revisions TO authenticated, service_role;

REVOKE ALL ON public.schedule_day_notes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.schedule_day_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_day_notes TO service_role;

GRANT SELECT ON public.goals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO service_role;

GRANT SELECT ON public.project_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_cards TO service_role;

GRANT SELECT, INSERT ON public.project_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_notes TO service_role;

GRANT SELECT ON public.reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO service_role;

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

REVOKE ALL ON FUNCTION public.replace_schedules_for_day_as(uuid, timestamptz, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_schedules_for_day_as(uuid, timestamptz, timestamptz, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_schedules_for_day_as(uuid, timestamptz, timestamptz, jsonb) TO service_role;

COMMIT;
