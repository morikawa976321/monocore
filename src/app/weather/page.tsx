import { connection } from 'next/server'
import { WeatherView } from '@/src/components/weather/WeatherView'
import { readWeatherLocation } from '@/src/lib/weather/location'

export default async function WeatherPage() {
    // ビルド時に読むと地点が静的な出力に焼き込まれるので、要求のたびに(ログインを通った後で)読む
    await connection()
    return <WeatherView location={readWeatherLocation()} />
}
