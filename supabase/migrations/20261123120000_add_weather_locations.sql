-- =======================================================
-- 天気の予報地点（weather_locations）（2026-11-23）
-- =======================================================
-- 本人の決定（2026-11-23）: 将来、複数の地点を切り替えて予報を見たいので、地点は1行1地点のテーブルで持つ。
--
-- 今の /weather は環境変数 WEATHER_NAME / WEATHER_LATITUDE / WEATHER_LONGITUDE をサーバーで読んでいる
-- （src/lib/weather/location.ts）。住んでいる地域が分かる値なので、ログイン無しで取れる JS には埋め込めない。
-- サーバーを持たない構成（docs/spa-migration.md の決めること①）では環境変数で渡せないため、
-- ログインした本人だけが読める行（RLS）に移す。
--
-- 実際の地点はこの migration に書かない（公開リポジトリ。location.ts と同じ理由）。本人が SQL エディタか
-- service_role のスクリプトで入れる。行が無いときの扱い（東京駅）は読む側が持つ。
--
-- 列は WeatherLocation（src/lib/weather/forecast.ts）の name / latitude / longitude に合わせる。
-- 既定の地点は sort_order が最小の行（同点は作った順）。どの地点を今見ているかは持たない（切り替えの画面を
-- 作るときに決める）。
-- 緯度・経度は範囲を CHECK で縛る。NaN・Infinity は BETWEEN を通らないので、まとめて弾かれる。
-- RLS・権限・updated_at トリガは finance_events（20261023120000）と同じ作法。
-- =======================================================

CREATE TABLE public.weather_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT weather_locations_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT weather_locations_latitude_range CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT weather_locations_longitude_range CHECK (longitude BETWEEN -180 AND 180)
);

ALTER TABLE public.weather_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own weather locations" ON public.weather_locations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own weather locations" ON public.weather_locations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own weather locations" ON public.weather_locations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own weather locations" ON public.weather_locations FOR DELETE USING (auth.uid() = user_id);

-- 切り替えの一覧は名前で選ぶので、同じ名前が2行あると区別がつかない。DB で弾く（user_id が先頭なので、
-- 本人の行の取得にも効く。行は数件なので並び順用の索引は持たない）。
CREATE UNIQUE INDEX uq_weather_locations_user_id_name ON public.weather_locations (user_id, name);

CREATE TRIGGER update_weather_locations_updated_at
    BEFORE UPDATE ON public.weather_locations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 既定の権限では anon にも付与されるので、他のテーブル（finance_events 等）と同じく外す。
REVOKE ALL ON public.weather_locations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_locations TO authenticated, service_role;
