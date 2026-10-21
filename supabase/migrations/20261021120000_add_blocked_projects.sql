-- =======================================================
-- 本人の手で止まっているプロジェクト（blocked_projects）（2026-10-21）
-- =======================================================
-- 本人の要望は「私でブロックされているプロジェクトと、それらのブロックを解除して AI にボールを
-- 投げかえすために必要な具体的なわたしのタスク」を monocore に出すこと。Ahead（/plan）の一番上に
-- プロジェクト1つにつき1枚のカードで出す。
--
-- 持つのはプロジェクト名と、止まっているタスクだけ（本人指定。待ち日数・返し方などの付帯情報は持たない）。
-- タスクは1行に1つの素のテキストで持つ。カードの本文をそのまま書く欄にし、AI もスキルから
-- 全置換・追記で書き換えるため（inboxes.content と同じ扱い）。
-- 中身は本人の手入力か、本人の指示で AI が更新する。各リポジトリの記録から自動で集める経路は持たない。
-- 並びは作った順。
-- =======================================================

CREATE TABLE public.blocked_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    tasks TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own blocked projects" ON public.blocked_projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own blocked projects" ON public.blocked_projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own blocked projects" ON public.blocked_projects FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own blocked projects" ON public.blocked_projects FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_blocked_projects_user_id_created_at ON public.blocked_projects (user_id, created_at);

CREATE TRIGGER update_blocked_projects_updated_at
    BEFORE UPDATE ON public.blocked_projects
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 既定の権限では anon にも付与されるので、他のテーブル（plan_goals 等）と同じく外す。
REVOKE ALL ON public.blocked_projects FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_projects TO authenticated, service_role;
