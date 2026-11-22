import type { WeatherLocation } from './forecast'

/**
 * 予報の地点の行が無いとき(weather_locations が空のとき)に使う地点。東京駅。
 * 実際の地点は住んでいる地域が分かるので、このリポジトリには置かず、テーブル weather_locations に本人が入れる
 * (src/lib/supabase/queries/weather-locations.ts が先頭の1件を読む)。
 */
export const DEFAULT_WEATHER_LOCATION: WeatherLocation = {
    name: '東京',
    latitude: 35.6812,
    longitude: 139.7671,
}
