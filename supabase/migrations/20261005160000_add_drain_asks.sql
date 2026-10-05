-- -------------------------------------------------------
-- drain_asks — 無人実行(taskbox drain)が本人に頼む「手を動かさないと片づかないこと」
--
-- drain_runs は1枠1行で保持48件(約2日)なので、そこに載せた依頼は新しい枠に埋もれて消える。
-- 依頼は本人が「済」にするまで残る必要があるため、run と切り離してここに置く(2026-10-05)。
-- それまでの届け先だった taskbox/handover.md の「本人判断待ち」は、本人が開かない面で
-- 7日後に黙って退避されるだけだったため廃止した(経緯は taskbox/README.md)。
--
-- 投入経路: taskbox/traces/<task-id>.json の asks[] → taskbox/lib/board.ps1
--          → monocore/scripts/upsert-drain-run.mjs(service_role)
-- id は taskbox 側で決める(<task-id>#<連番>)。同じ trace を二度拾っても行は増えず、
-- 投入は ON CONFLICT DO NOTHING なので本人が付けた resolved_at を上書きしない。
-- 画面からは SELECT と resolved_at の更新だけ。
-- -------------------------------------------------------
CREATE TABLE public.drain_asks (
    id TEXT PRIMARY KEY,
    source TEXT,
    title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX drain_asks_open_idx ON public.drain_asks (created_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.drain_asks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select drain asks"
ON public.drain_asks
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can resolve drain asks"
ON public.drain_asks
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

GRANT SELECT ON public.drain_asks TO authenticated;
-- 列単位の付与: 画面から書き換えられるのは「済」の印だけ。
GRANT UPDATE (resolved_at) ON public.drain_asks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drain_asks TO service_role;
