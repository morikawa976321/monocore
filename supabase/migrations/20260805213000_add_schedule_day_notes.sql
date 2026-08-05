-- -------------------------------------------------------
-- schedule_day_notes
--
-- /schedules の各 DaySection に併設する自由記述メモの保存先。
-- 1ユーザー・1ローカル日につき1レコード。本文は記法制約なしのプレーンテキストで、
-- schedules のような時刻ブロックへの分解は一切行わない。
--
-- schedules / schedule_day_revisions / replace_schedules_for_day には手を触れない。
-- メモは予定と保存経路を完全に分離する（リビジョンによる競合検出も持たない）。
-- 競合制御は inboxes と同じ last-write-wins。単一ユーザーの個人用メモ欄であり、
-- 予定のような「テキストを分解して行を入れ替える」処理を伴わないため、
-- リビジョン機構のコストに見合わないと判断した（2026-08-05）。
--
-- DELETE ポリシーは作らない。空文字の保存が実質的な削除であり、行が残っても害はない。
--
-- 加算的マイグレーション。既存テーブル・既存関数の変更・削除は行わない。
-- -------------------------------------------------------
BEGIN;

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

-- DELETE ポリシーは意図的に作らない（上記コメント参照）。

CREATE TRIGGER update_schedule_day_notes_updated_at
    BEFORE UPDATE ON public.schedule_day_notes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.schedule_day_notes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.schedule_day_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_day_notes TO service_role;

COMMIT;
