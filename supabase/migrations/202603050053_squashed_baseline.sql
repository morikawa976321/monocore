-- -------------------------------------------------------
-- Squashed baseline schema (public)
--
-- これまでの個別マイグレーションを1本へ統合したもの。
-- 「作って後で消した」変更（tasks のアーカイブ機能一式、projects/knowledge の
-- deleted_at 論理削除）は最終形のみを反映し、途中経過は含めない。
-- リモート本番の schema.sql（2026-07-17 取得）と完全一致することを前提とする。
-- -------------------------------------------------------
BEGIN;

-- =======================================================
-- 共通関数
-- =======================================================

-- updated_at の自動更新
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- status が変化した時に status_changed_at を自動更新
CREATE OR REPLACE FUNCTION public.update_status_changed_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        NEW.status_changed_at = now();
    END IF;
    RETURN NEW;
END;
$$;

-- title を body の先頭行から導出（行頭の # と続く空白を除去）
CREATE OR REPLACE FUNCTION public.set_title_from_body()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.title := regexp_replace(
        split_part(replace(COALESCE(NEW.body, ''), E'\r\n', E'\n'), E'\n', 1),
        '^#\s*',
        ''
    );
    RETURN NEW;
END;
$$;

-- 新規 INSERT 時: 同一 user・同一 status の先頭（MIN - 1）へ置く
CREATE OR REPLACE FUNCTION public.set_resource_sort_order_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    min_order INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'projects' THEN
        SELECT MIN(sort_order) INTO min_order
        FROM public.projects
        WHERE user_id = NEW.user_id
          AND status = NEW.status;
    ELSIF TG_TABLE_NAME = 'knowledge' THEN
        SELECT MIN(sort_order) INTO min_order
        FROM public.knowledge
        WHERE user_id = NEW.user_id
          AND status = NEW.status;
    END IF;

    NEW.sort_order := COALESCE(min_order, 0) - 1;
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
-- tasks
-- =======================================================
CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
    task TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'completed', 'deleted')),
    due_at TIMESTAMPTZ,
    status_changed_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by TEXT NOT NULL DEFAULT 'user' CHECK (updated_by IN ('user', 'agent'))
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own tasks" ON public.tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own tasks" ON public.tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own tasks" ON public.tasks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_tasks_user_id_status ON public.tasks (user_id, status);
CREATE INDEX idx_tasks_user_id_due_at ON public.tasks (user_id, due_at);

CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tasks_status_changed_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_status_changed_at_column();

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
-- projects（Markdown 本文は body / 状態は status ベース）
-- =======================================================
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT NOT NULL DEFAULT 'user' CHECK (updated_by IN ('user', 'agent')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'deleted')),
    status_changed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_projects_user_id_status_sort_order ON public.projects (user_id, status, sort_order);

CREATE TRIGGER set_projects_title_from_body
    BEFORE INSERT OR UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.set_title_from_body();

CREATE TRIGGER set_projects_sort_order_on_insert
    BEFORE INSERT ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.set_resource_sort_order_on_insert();

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_status_changed_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.update_status_changed_at_column();

-- =======================================================
-- knowledge（Markdown 本文は body / 状態は status ベース）
-- =======================================================
CREATE TABLE public.knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT NOT NULL DEFAULT 'user' CHECK (updated_by IN ('user', 'agent')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'deleted')),
    status_changed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own knowledge" ON public.knowledge FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own knowledge" ON public.knowledge FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own knowledge" ON public.knowledge FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_knowledge_user_id_status_sort_order ON public.knowledge (user_id, status, sort_order);

CREATE TRIGGER set_knowledge_title_from_body
    BEFORE INSERT OR UPDATE ON public.knowledge
    FOR EACH ROW
    EXECUTE FUNCTION public.set_title_from_body();

CREATE TRIGGER set_knowledge_sort_order_on_insert
    BEFORE INSERT ON public.knowledge
    FOR EACH ROW
    EXECUTE FUNCTION public.set_resource_sort_order_on_insert();

CREATE TRIGGER update_knowledge_updated_at
    BEFORE UPDATE ON public.knowledge
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_knowledge_status_changed_at
    BEFORE UPDATE ON public.knowledge
    FOR EACH ROW
    EXECUTE FUNCTION public.update_status_changed_at_column();

-- =======================================================
-- RPC: 指定日のスケジュールを一括置換（ユーザーセッション用 / UTC のみ）
-- =======================================================
CREATE OR REPLACE FUNCTION public.replace_schedules_for_day(
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

-- =======================================================
-- RPC: 指定日のスケジュールを一括置換（service_role 専用 / 対象ユーザーを引数で明示）
-- SECURITY DEFINER かつ内部認証チェックが無いため、PUBLIC/anon/authenticated から
-- 必ず剥奪し service_role にのみ EXECUTE を付与する（他人の予定全削除の防止）。
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inboxes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.replace_schedules_for_day(timestamptz, timestamptz, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.replace_schedules_for_day_as(uuid, timestamptz, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_schedules_for_day_as(uuid, timestamptz, timestamptz, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_schedules_for_day_as(uuid, timestamptz, timestamptz, jsonb) TO service_role;

COMMIT;
