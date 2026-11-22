import { useEffect, useState } from 'react'
import { createClient } from '@/src/lib/supabase/client'
import { getDefaultWeatherLocation } from '@/src/lib/supabase/queries/weather-locations'
import { DEFAULT_WEATHER_LOCATION } from '@/src/lib/weather/location'
import type { WeatherLocation } from '@/src/lib/weather/forecast'

/**
 * 天気の地点を `weather_locations` の先頭の1件から読む(行が無ければ東京駅)。
 * 読めなかったときは東京を出さず、失敗として返す。別の地域の予報を黙って見せないため。
 * 複数地点の切り替えは monocore#5。
 */
export function useWeatherLocation(): { location: WeatherLocation | null; errorMessage: string | null } {
    const [location, setLocation] = useState<WeatherLocation | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        void getDefaultWeatherLocation(createClient()).then(({ data, error }) => {
            if (cancelled) return
            if (error) {
                setErrorMessage('天気の地点の読み込みに失敗しました。')
                return
            }
            setLocation(data ?? DEFAULT_WEATHER_LOCATION)
        })
        return () => {
            cancelled = true
        }
    }, [])

    return { location, errorMessage }
}
