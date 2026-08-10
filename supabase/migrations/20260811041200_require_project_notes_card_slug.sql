-- 板全体メモ（card_slug IS NULL）を廃止し、カード単位のみにする。
-- 既存の板全体行は削除し、以降は card_slug を必須にする。

DELETE FROM public.project_notes
WHERE card_slug IS NULL;

ALTER TABLE public.project_notes
    ALTER COLUMN card_slug SET NOT NULL;
