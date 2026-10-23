-- =======================================================
-- 家計の見通し（finance_events / finance_measurements）（2026-10-23）
-- =======================================================
-- 本人の決定（2026-10-22〜23）: 家計管理を Excel ブック（others/finance/finance_plan.xlsx）から monocore の
-- 5つめのページ /finance へ移す。表の唯一の価値は「今後資産をどう使うかを決める材料」。
--
-- 持つのは2表だけ。
--   finance_events        計画イベント（1原因=1行。開始月〜終了月に毎月 cash_delta / nisa_delta が効く。
--                         終了月が NULL なら開始月の1か月だけ）。本人が自由に書き換えてシミュレーションする。
--   finance_measurements  月末の実残高（Cash・NISA の2個）。月に1行。実績は「承認」ではなく「測定」。
-- 未来の残高は保存しない（画面と CLI が、最新の実測を起点にイベントを足し込んで計算する）。
-- 「計画との差」も保存しない（実測を入れる瞬間に予測と見比べるだけ、と本人が決めた）。
-- 終わったイベントの非表示は列で持たず、「coalesce(end_month, start_month) <= 最新の実測月」から導く
--（記録時の書き込みが実測1行だけになり、データは全部残る）。
--
-- 月は DATE 型の月初（YYYY-MM-01）で持つ。finance_measurements.month は「その月の末時点」の意味。
-- 金額は整数円。JavaScript の安全整数の範囲に収める CHECK を付ける（画面が Number で計算するため）。
-- RLS・権限・updated_at トリガは blocked_projects（20261021120000）と同じ作法。
-- =======================================================

CREATE TABLE public.finance_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    start_month DATE NOT NULL,
    end_month DATE,
    cash_delta BIGINT NOT NULL DEFAULT 0,
    nisa_delta BIGINT NOT NULL DEFAULT 0,
    memo TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT finance_events_start_is_month_start CHECK (start_month = date_trunc('month', start_month)::date),
    CONSTRAINT finance_events_end_is_month_start CHECK (end_month IS NULL OR end_month = date_trunc('month', end_month)::date),
    CONSTRAINT finance_events_end_not_before_start CHECK (end_month IS NULL OR end_month >= start_month),
    CONSTRAINT finance_events_safe_integers CHECK (abs(cash_delta) <= 9007199254740991 AND abs(nisa_delta) <= 9007199254740991)
);

CREATE TABLE public.finance_measurements (
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    cash BIGINT NOT NULL,
    nisa BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, month),
    CONSTRAINT finance_measurements_month_is_month_start CHECK (month = date_trunc('month', month)::date),
    CONSTRAINT finance_measurements_safe_integers CHECK (abs(cash) <= 9007199254740991 AND abs(nisa) <= 9007199254740991)
);

ALTER TABLE public.finance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own finance events" ON public.finance_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own finance events" ON public.finance_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own finance events" ON public.finance_events FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own finance events" ON public.finance_events FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can select their own finance measurements" ON public.finance_measurements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own finance measurements" ON public.finance_measurements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own finance measurements" ON public.finance_measurements FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own finance measurements" ON public.finance_measurements FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_finance_events_user_id_start_month ON public.finance_events (user_id, start_month, created_at);

CREATE TRIGGER update_finance_events_updated_at
    BEFORE UPDATE ON public.finance_events
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_finance_measurements_updated_at
    BEFORE UPDATE ON public.finance_measurements
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 既定の権限では anon にも付与されるので、他のテーブル（blocked_projects 等）と同じく外す。
REVOKE ALL ON public.finance_events FROM PUBLIC, anon;
REVOKE ALL ON public.finance_measurements FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_measurements TO authenticated, service_role;
