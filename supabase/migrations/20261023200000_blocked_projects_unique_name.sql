-- -------------------------------------------------------
-- blocked_projects の名前を利用者ごとに一意にする(2026-10-23)
--
-- Tasks(/plan)はカードを枠の名前(src/lib/tasks/slots.ts)の完全一致で選び、行がまだ無い枠は最初の保存で
-- 作る。monocore スキルの blocked 系コマンドも名前の完全一致でカードを選び、同名が2枚あると止まる。
-- 画面と AI が同時に同じ枠を作っても2枚にならないよう、DB で弾く(画面は 23505 を「別の場所で作られていた」と出す)。
-- 適用時点の本番の名前に重複は無い(2026-10-23 に monocore スキルの blocked list で確認)。
-- -------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_blocked_projects_user_id_name ON public.blocked_projects (user_id, name);
