-- inboxesのcontentが上書きで消えても遡れるようにする(2026-08-30)。
--
-- 経緯: 2026-08-29、inboxes.contentが空文字列で上書きされ、直前の内容が
-- 一時的に失えなくなった(本番のdata.dumpから復旧はできたが、復旧点は
-- 2026-08-09時点のバックアップまでしか遡れず、以後の追記は失われた)。
--
-- schedule_day_revisions は名前が近いが実体は楽観ロック用のカウンタで
-- あり(古いcontentを保持しない)、今回の「上書きされた値を読み返す」
-- 用途には使えない。ここではUPDATE直前のcontentをそのまま複製する
-- 単純な履歴テーブルを新設する。
--
-- 保持件数は1ユーザーあたり直近50件に制限する(本番DBがMB未満規模のため、
-- 無制限に伸ばさない)。

CREATE TABLE public.inbox_revisions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    revised_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbox_revisions_user_id_revised_at
    ON public.inbox_revisions (user_id, revised_at DESC);

ALTER TABLE public.inbox_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own inbox revisions"
ON public.inbox_revisions
FOR SELECT
USING (auth.uid() = user_id);

-- UPDATE直前のcontentを退避してから直近50件だけ残す。
-- SECURITY DEFINERなのはservice_role/authenticatedのどちらの書き込み経路でも
-- 同じ挙動にするため(RLSにINSERT/UPDATE/DELETEポリシーを別途足さずに済む)。
CREATE OR REPLACE FUNCTION public.record_inbox_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.content IS DISTINCT FROM NEW.content THEN
        INSERT INTO public.inbox_revisions (user_id, content, revised_at)
        VALUES (OLD.user_id, OLD.content, OLD.updated_at);

        DELETE FROM public.inbox_revisions
        WHERE user_id = OLD.user_id
          AND id NOT IN (
              SELECT id FROM public.inbox_revisions
              WHERE user_id = OLD.user_id
              ORDER BY revised_at DESC
              LIMIT 50
          );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER inboxes_record_revision
    BEFORE UPDATE ON public.inboxes
    FOR EACH ROW
    EXECUTE FUNCTION public.record_inbox_revision();

GRANT SELECT ON public.inbox_revisions TO authenticated, service_role;
