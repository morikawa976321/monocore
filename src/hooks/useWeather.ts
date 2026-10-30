'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDefaultTimezone } from '@/src/lib/date'
import { fetchForecast, type OpenMeteoForecast, type WeatherLocation } from '@/src/lib/weather/forecast'

/**
 * Open-Meteo の予報を取る。表の行は呼び出し側が今の時刻と合わせて組み立てる(先頭の行が時刻とともに進むため)。
 * 予報は取った日の今日・明日の2日分なので、開いたまま日付が変わったら取り直す(today が変わるたびに取る)。
 */
export function useWeather(today: string | null, location: WeatherLocation) {
    const { latitude, longitude } = location
    const [forecast, setForecast] = useState<OpenMeteoForecast | null>(null)
    const [isInitialLoading, setIsInitialLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const hasLoaded = useRef(false)
    const latestRequest = useRef(0)

    const load = useCallback(async () => {
        // 23:59 の手動更新と 0:00 の自動取得が重なったとき、遅れて届いた前日の応答で巻き戻さない
        const request = ++latestRequest.current
        if (hasLoaded.current) {
            setIsRefreshing(true)
        } else {
            setIsInitialLoading(true)
        }
        let result: OpenMeteoForecast | null = null
        try {
            result = await fetchForecast({ latitude, longitude },getDefaultTimezone())
        } catch {
            // 下で、最新の要求のときだけ失敗を出す
        }
        if (request !== latestRequest.current) return
        if (result) {
            setForecast(result)
            setErrorMessage(null)
        } else {
            setErrorMessage('天気の読み込みに失敗しました。')
        }
        hasLoaded.current = true
        setIsInitialLoading(false)
        setIsRefreshing(false)
    }, [latitude, longitude])

    useEffect(() => {
        if (today !== null) void load()
    }, [today, load])

    return { forecast, isInitialLoading, isRefreshing, errorMessage, reload: load }
}
