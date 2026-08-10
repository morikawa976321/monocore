-- -------------------------------------------------------
-- project_cards から未使用列 collapsed / sources を削除する。
--
-- collapsed: 月次スコープで「畳む」初期表示用として追加したが、
--   UI はローカル state の開閉のみで DB 列を読んでいない。
-- sources: カード組み立て時に読んだファイルパスの出所記録として追加したが、
--   画面表示・分岐のいずれからも参照されていない。
-- upsert スクリプト側の書き込みも同時に外す前提。
-- -------------------------------------------------------
BEGIN;

ALTER TABLE public.project_cards
    DROP COLUMN IF EXISTS collapsed,
    DROP COLUMN IF EXISTS sources;

COMMIT;
