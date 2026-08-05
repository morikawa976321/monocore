-- -------------------------------------------------------
-- project_cards.status に 'done'（完了）を追加する。
--
-- 元の4状態は active / waiting_user / waiting_other / dormant で、
-- 「終わったプロジェクト」を表す状態が無かった。upsert は行を削除しないため、
-- 2026-08-05 に完了した2件（Xiaomi購入・TWS購入）は dormant へ退避されたが、
-- dormant は「寝ている＝再開しうる」であって完了ではなく、意味が違う。
--
-- CHECK 制約の張り替えのみ。既存行のデータは一切変更しない。
-- -------------------------------------------------------
BEGIN;

ALTER TABLE public.project_cards
    DROP CONSTRAINT IF EXISTS project_cards_status_check;

ALTER TABLE public.project_cards
    ADD CONSTRAINT project_cards_status_check
    CHECK (status IN ('active', 'waiting_user', 'waiting_other', 'dormant', 'done'));

COMMIT;
