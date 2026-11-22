import { PageHeader } from '@/src/components/layout/PageHeader'
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator'
import { WeatherView } from '@/src/components/weather/WeatherView'
import { useWeatherLocation } from '@/src/hooks/useWeatherLocation'

/**
 * 地点を読んでから WeatherView に渡す。地点は RLS で本人の行だけが読めるテーブルにあり、ブラウザから読む
 * (JS には地点を埋め込まない)。読めるまでは、WeatherView の同期中と同じ見た目の枠を出す。
 */
export default function WeatherPage() {
    const { location, errorMessage } = useWeatherLocation()

    if (location) return <WeatherView location={location} />

    return (
        <div className="flex flex-col h-screen bg-neutral-250 dark:bg-neutral-900">
            <PageHeader title="Weather">
                {errorMessage && <span className="text-sm text-amber-600 dark:text-amber-400">{errorMessage}</span>}
            </PageHeader>

            <div className="flex-1 overflow-hidden relative">
                {!errorMessage && (
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
