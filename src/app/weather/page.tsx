'use client'

import { useMemo } from 'react'
import { PageHeader } from '@/src/components/layout/PageHeader'
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator'
import { WeatherTable } from '@/src/components/weather/WeatherTable'
import { useNow } from '@/src/hooks/useNow'
import { useWeather } from '@/src/hooks/useWeather'
import { buildWeatherDays, WEATHER_LOCATION } from '@/src/lib/weather/forecast'

export default function WeatherPage() {
    const { forecast, isInitialLoading, isRefreshing, errorMessage, reload } = useWeather()
    const now = useNow()
    // now は毎分変わるが、表の先頭の行が進むのは時が変わったときだけ
    const today = now?.today ?? null
    const currentHour = now === null ? null : Math.floor(now.nowMinutes / 60)
    const days = useMemo(
        () => (forecast && today !== null && currentHour !== null ? buildWeatherDays(forecast, today, currentHour) : []),
        [forecast, today, currentHour]
    )

    return (
        <div className="flex flex-col h-screen bg-neutral-250 dark:bg-neutral-900">
            <PageHeader title="Weather" onRefresh={() => void reload()} isRefreshing={isRefreshing}>
                {errorMessage && <span className="text-sm text-amber-600 dark:text-amber-400">{errorMessage}</span>}
            </PageHeader>

            <div className="flex-1 overflow-hidden relative">
                <div className="h-full overflow-y-auto px-2 sm:px-6 py-1 sm:py-4">
                    {today !== null && days.length > 0 && (
                        <div className="max-w-3xl mx-auto space-y-4 pb-12">
                            <WeatherTable days={days} today={today} />
                            <p className="text-sm text-neutral-700 dark:text-neutral-300">
                                {WEATHER_LOCATION.name}の予報。データ:{' '}
                                <a
                                    href="https://open-meteo.com/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline hover:text-neutral-900 dark:hover:text-neutral-50"
                                >
                                    Open-Meteo.com
                                </a>{' '}
                                (CC BY 4.0)
                            </p>
                        </div>
                    )}
                </div>

                {isInitialLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-250/80 dark:bg-neutral-900/80">
                        <div className="flex items-center gap-2 bg-neutral-200 border border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700 rounded p-4">
                            <LoadingIndicator />
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">同期中…</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
