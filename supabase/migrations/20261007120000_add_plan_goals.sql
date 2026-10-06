-- =======================================================
-- 計画の目標（plan_goals）（2026-10-07）
-- =======================================================
-- 本人の要望は「この日までにこれを達成したい（する必要がある）という目標を設定したい」。
-- /plan で目標を入れ、スケジュール画面の上に目標ごとの数字（置いた時間・締切までの空き・
-- 余裕/不足）を出す。
--
-- 持つのは名前・期日・必要な時間だけ。進捗の列は持たない。「置いた時間」は、予定の行のうち
-- 時刻範囲つきで名前を含むものを画面側で数える（入力の置き場を予定の板1か所にするため）。
-- 2026-08-23 に目標分類（goals）を、2026-09-11 にプロジェクト板を撤去しており、
-- 手で更新し続ける欄は義務化して使われなくなった実績がある（docs/decisions.md）。
-- 終わった目標は消す。
--
-- 期日はローカルの日付と時刻で持つ（schedule_day_notes.day_key と同じ扱い）。
-- due_time が NULL ならその日の終わりまで。
-- =======================================================

CREATE TABLE public.plan_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    due_on DATE NOT NULL,
    due_time TIME,
    need_minutes INTEGER NOT NULL DEFAULT 0 CHECK (need_minutes >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own plan goals" ON public.plan_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own plan goals" ON public.plan_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own plan goals" ON public.plan_goals FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own plan goals" ON public.plan_goals FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_plan_goals_user_id_due_on ON public.plan_goals (user_id, due_on);

CREATE TRIGGER update_plan_goals_updated_at
    BEFORE UPDATE ON public.plan_goals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
