-- プロジェクトカードを「①状態 ②どこまで進んだか ③次に本人がやること」の3点へ絞る。
-- 計画書: docs/project-cards-simplification-plan.md（2026-08-11・本人承認済み）
--
-- 判断の入出力（decisions と project_notes）をやめる理由: 反映が1日4回・非同期という
-- 制約のもとでは、板で判断を返すよりセッションを開いた方が速いと本人が判断した。
-- ai_next をやめる理由: AIの次の一手であっても承認し発火させるのは本人なので、
-- AIと人間の次の一手を分ける意味が無い。
--
-- decisions に入っていた実データ14件は、この適用前に1件ずつ退避判定を済ませてある
-- （engineに既出=13件はそのまま削除／未記録の実測事実1件は context-engine の
-- 01_inbox/2026-08-11-pc-case-leg-needs-chamfer-angle.md へ記録してから削除）。
-- project_notes は適用直前に「35行・未消化0」を実測で確認している。

-- status: waiting_user / waiting_other を waiting（トリガー待ち）へ統合する。
-- 「誰を待っているか」で分けても、実質のボトルネックは常に本人なので行動が変わらない。
--
-- 順序は「旧制約を落とす → 値を移す → 新制約を張る」でなければならない。
-- 計画書は「既存行の値移行が先。制約変更より前に」と書いていたが、それでは通らない —
-- 旧制約が 'waiting' を許していないので UPDATE 自体が 23514 で弾かれる
-- （2026-08-11にローカルDBでリハーサルして実際に失敗したため、この順序へ直した）。
-- 計画書の意図（新制約を張る前にデータを移し終える）はこの順序でも満たされている。
ALTER TABLE public.project_cards
    -- 制約名はライブDBで実測した実物（squash後も既定命名のまま
    -- project_cards_status_check であることを2026-08-11に確認）。
    -- 名前が違えばここで失敗して止まるのが正しい（黙って進ませない）。
    DROP CONSTRAINT project_cards_status_check;

UPDATE public.project_cards
SET status = 'waiting'
WHERE status IN ('waiting_user', 'waiting_other');

ALTER TABLE public.project_cards
    ADD CONSTRAINT project_cards_status_check
    CHECK (status IN ('active', 'waiting', 'dormant', 'done'));

ALTER TABLE public.project_cards DROP COLUMN decisions;
ALTER TABLE public.project_cards DROP COLUMN ai_next;

-- project_notes を丸ごと廃止する。板は taskbox → 画面の一方向になり、
-- 画面からの書き込み経路そのものを持たない（導出物に手入力欄を作らない原則へ回帰）。
-- 依存オブジェクトはこのテーブル自身のindex・policy・GRANTだけで、関数もビューも無い。
DROP TABLE public.project_notes;
