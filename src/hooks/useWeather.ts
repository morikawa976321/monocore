'use client'

import { useCallback, useEffect, useState } from 'react'
import { getDefaultTimezone } from '@/src/lib/date'
import { fetchForecast, type OpenMeteoForecast } from '@/src/lib/weather/forecast'

/** Open-Meteo の予報を取る。表の行は呼び出し側が今の時刻と合わせて組み立てる(1時間ごとに先頭の行が進むため) */
export function useWeather() {
    const [forecast, setForecast] = useState<OpenMeteoForecast | null>(null)
    const [isInitialLoading, setIsInitialLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
        if (mode === 'refresh') {
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
        setIsInitialLoading(false)
        setIsRefreshing(false)
    }, [])

    useEffect(() => {
        void load('initial')
    }, [load])

    return { forecast, isInitialLoading, isRefreshing, errorMessage, reload: () => load('refresh') }
}
