-- -------------------------------------------------------
-- project_card_decision_answers テーブルを完全に削除する。
-- 事前確認: 2026-08-09、アプリ・scripts のいずれからも読み書きしていない。
-- 2026-08-05 に project_notes（自由記述）へ置き換え済み。
-- カード上の「AIが聞きたいこと」は project_cards.decisions (jsonb) の表示のみ。
-- 紐づく RLS ポリシー・インデックス・GRANT は DROP TABLE で自動削除される。
-- -------------------------------------------------------
BEGIN;

DROP TABLE IF EXISTS public.project_card_decision_answers;

COMMIT;
