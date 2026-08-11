-- -------------------------------------------------------
-- drain_runs — taskbox drain の1枠(01/07/13/19時)につき1行
--
-- 導出物であり、正は taskbox 側にある(reports / project_cards と同じ扱い)。
-- 画面からは SELECT のみ、書き込みは service_role(投入スクリプト)のみ。
-- 投入経路: taskbox/drain.ps1 → monocore/scripts/upsert-drain-run.mjs
--
-- 「何をして／どうなったか」の組は2系統を持つ:
--   steps — ラッパー(drain.ps1)が機械的に観測した工程。LLMの自己申告を含まない
--   tasks — taskbox/traces/<task-id>.json 由来。trace の steps[] がそのまま組になる
-- どちらも JSONB でそのまま持つ。taskbox 側のトレース書式が変わっても
-- ここのマイグレーションを追従させなくてよいようにするため(表示側が読む)。
--
-- 起動しなかった枠(トリアージで理由ゼロ)も outcome='skipped' で1行書く。
-- 「静かだったのか、動かなかっただけなのか」が一覧で判別できることがこの面の要件。
-- -------------------------------------------------------
CREATE TABLE public.drain_runs (
    started_at TIMESTAMPTZ PRIMARY KEY,
    ended_at TIMESTAMPTZ,
    outcome TEXT NOT NULL CHECK (outcome IN ('completed', 'crashed', 'skipped')),
    trigger_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    model TEXT,
    effort TEXT,
    exit_code INTEGER,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
    report_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.drain_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select drain runs"
ON public.drain_runs
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.drain_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drain_runs TO service_role;
