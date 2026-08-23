-- statusカラムを全廃し、sort_orderをpriorityへ改名する。
-- 本人指示（2026-08-23）: 「休止中(dormant)」の別枠出しをやめ、板は優先度降順の
-- フラット表示にする。statusが担っていたのはこの休止中の折りたたみ表示と、
-- doneカードを取得段階で除外する2点だけで、休止中を廃止すると残るのはdoneの
-- 除外だけになる。done用の代替フラグは作らない — 板はアーカイブではなく
-- 「今読むべきものだけを出す面」であり（[[frozen-project-with-low-thaw-chance-leaves-board]]）、
-- 完了したカードは行を残さずJSON側で削除する（upsertスクリプトの集合一致delete機構に
-- 既に乗っている）。
--
-- sort_orderは元から手動の表示順そのものだったため、新規カラムを追加せず改名する。
--
-- DROP COLUMN status は複合インデックス idx_project_cards_status_sort_order を
-- 道連れに落とす（statusを含む唯一のインデックス）。表示のソートキーはpriority単独に
-- なるので、単一列インデックスへ張り替える。
ALTER TABLE public.project_cards
    DROP CONSTRAINT project_cards_status_check;

ALTER TABLE public.project_cards DROP COLUMN status;
ALTER TABLE public.project_cards RENAME COLUMN sort_order TO priority;

CREATE INDEX idx_project_cards_priority
    ON public.project_cards (priority DESC);
