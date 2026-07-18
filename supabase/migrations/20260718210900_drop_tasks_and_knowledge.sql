-- -------------------------------------------------------
-- tasks テーブルと knowledge テーブルを完全に削除する。
-- 事前確認: 2026-07-18、ユーザー指示により両機能のページ・関連コードを削除済み。
-- tasks: 全行が完了/削除済み。knowledge: 7行だが全て空(title/body空)。
-- バックアップ: backups/manual/pre-task-knowledge-drop-20260718-200700.sql (data-only dump)
-- -------------------------------------------------------
BEGIN;

-- テーブル削除に伴い、紐づくトリガー・RLSポリシー・インデックスは自動的に削除される。
DROP TABLE IF EXISTS public.tasks;
DROP TABLE IF EXISTS public.knowledge;

-- 以下のトリガー関数は、tasks/knowledge の削除により完全に孤立するため削除する。
-- 各関数の用途確認:
--   set_resource_sort_order_on_insert: projects 分岐は 20260717151700_drop_projects.sql で削除済み。
--     残るのは knowledge 分岐のみ。knowledge が消えるため、この関数全体が不要となる。
--   set_title_from_body: knowledge テーブルのみが使用していたため、不要。
--   update_status_changed_at_column: tasks と knowledge のみが status 列と当該トリガーを持つ。
--     schedules と inboxes には status 列がないため、この関数は不要。

DROP FUNCTION IF EXISTS public.set_resource_sort_order_on_insert();
DROP FUNCTION IF EXISTS public.set_title_from_body();
DROP FUNCTION IF EXISTS public.update_status_changed_at_column();

-- update_updated_at_column は schedules と inboxes が引き続き使用するため削除しない。

COMMIT;
