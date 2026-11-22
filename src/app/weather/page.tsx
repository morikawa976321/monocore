import { WeatherView } from '@/src/components/weather/WeatherView'
import { getDefaultWeatherLocation } from '@/src/lib/supabase/queries/weather-locations'
import { createClient } from '@/src/lib/supabase/server'
import { DEFAULT_WEATHER_LOCATION } from '@/src/lib/weather/location'

export default async function WeatherPage() {
    // 地点は本人の行(RLS)で、ログインを通った後の要求のたびに読む。createClient が cookies() を使うので動的な
    // 描画になり、ビルド時に読まれて静的な出力に地点が焼き込まれることは無い。
    const supabase = await createClient()
    const { data, error } = await getDefaultWeatherLocation(supabase)
    // 読めなかったときに既定の地点(東京)を出すと、別の地域の予報を黙って見せてしまう。エラーのまま落とす。
    if (error) throw error
    return <WeatherView location={data ?? DEFAULT_WEATHER_LOCATION} />
}
