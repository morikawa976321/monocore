-- -------------------------------------------------------
-- projects テーブルを完全に削除する。
-- 事前確認: 2026-07-17、ユーザー指示によりProjectsページ・関連コードを削除済み。
-- projectsテーブルへの参照は本ファイルの set_resource_sort_order_on_insert 更新のみ。
-- バックアップ: backups/manual/pre-projects-table-drop-20260717-1514.sql (data-only dump)
-- -------------------------------------------------------
BEGIN;

-- テーブル削除に伴い、紐づくトリガー・RLSポリシー・インデックスは自動的に削除される。
DROP TABLE IF EXISTS public.projects;

-- set_resource_sort_order_on_insert から projects 分岐を除去(knowledge専用に縮小)。
CREATE OR REPLACE FUNCTION public.set_resource_sort_order_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    min_order INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'knowledge' THEN
        SELECT MIN(sort_order) INTO min_order
        FROM public.knowledge
        WHERE user_id = NEW.user_id
          AND status = NEW.status;
    END IF;

    NEW.sort_order := COALESCE(min_order, 0) - 1;
    RETURN NEW;
END;
$$;

COMMIT;
