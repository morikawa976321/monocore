'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDefaultTimezone } from '@/src/lib/date'
import { fetchForecast, type OpenMeteoForecast } from '@/src/lib/weather/forecast'

/**
 * Open-Meteo の予報を取る。表の行は呼び出し側が今の時刻と合わせて組み立てる(先頭の行が時刻とともに進むため)。
 * 予報は取った日の今日・明日の2日分なので、開いたまま日付が変わったら取り直す(today が変わるたびに取る)。
 */
export function useWeather(today: string | null) {
    const [forecast, setForecast] = useState<OpenMeteoForecast | null>(null)
    const [isInitialLoading, setIsInitialLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const hasLoaded = useRef(false)

    const load = useCallback(async () => {
        if (hasLoaded.current) {
            setIsRefreshing(true)
        } else {
            setIsInitialLoading(true)
        }
        try {
            setForecast(await fetchForecast(getDefaultTimezone()))
            setErrorMessage(null)
        } catch {
            setErrorMessage('天気の読み込みに失敗しました。')
        }
        hasLoaded.current = true
        setIsInitialLoading(false)
        setIsRefreshing(false)
    }, [])

    useEffect(() => {
        if (today !== null) void load()
    }, [today, load])

    return { forecast, isInitialLoading, isRefreshing, errorMessage, reload: load }
}
