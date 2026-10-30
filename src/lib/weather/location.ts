import type { WeatherLocation } from './forecast'

/**
 * 予報の地点。住んでいる地域が分かるので、実際の値は環境変数で与えて公開リポジトリに置かない(未設定なら東京駅)。
 * サーバーでだけ読む。NEXT_PUBLIC_ にするとログイン無しで取れる _next/static の JS に値が埋め込まれる。
 */
export function readWeatherLocation(): WeatherLocation {
    return {
        name: process.env.WEATHER_NAME || '東京',
        latitude: Number(process.env.WEATHER_LATITUDE || 35.6812),
        longitude: Number(process.env.WEATHER_LONGITUDE || 139.7671),
    }
}
