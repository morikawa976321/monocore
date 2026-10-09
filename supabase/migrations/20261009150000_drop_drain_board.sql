-- -------------------------------------------------------
-- drain 報告板(/drain)の廃止(2026-10-09 本人指示「monocoreのdrain板の削除を行って。table dropも行ってよい」)
--
-- taskbox(無人実行の drain)の廃止が決まり、板に書き込む側が無くなった。定時の機械工程は mf/ops の
-- ops-daily へ移り、失敗は inbox へ通知する形になったので、板の役割は残っていない。
-- 削除前の全行は monocore/backups/manual/drain-tables-before-drop-20261009.json(git 管理外)と、
-- 定期バックアップ(backups/auto)に残っている。未処理の依頼(resolved_at が NULL の drain_asks)は0件だった。
-- ポリシー・インデックスはテーブルと一緒に消える。
-- -------------------------------------------------------
DROP TABLE IF EXISTS public.drain_asks;
DROP TABLE IF EXISTS public.drain_runs;
