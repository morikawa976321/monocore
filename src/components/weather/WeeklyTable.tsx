import { ArrowRight, Cloud, Snowflake, Sun, Umbrella, type LucideIcon } from 'lucide-react'
import type { DayPhrase, DayWeather, WeeklyDay } from '@/src/lib/weather/weekly'
import { Amount } from './WeatherTable'

const ICONS: Record<DayWeather, LucideIcon> = { sun: Sun, cloud: Cloud, rain: Umbrella, snow: Snowflake }
const LABELS: Record<DayWeather, string> = { sun: '晴', cloud: '曇', rain: '雨', snow: '雪' }
const JOINERS = { later: 'のち', sometimes: '時々' } as const

const CELL = 'py-2 border-b border-neutral-300 dark:border-neutral-700'
const MUTED = 'text-neutral-500'
const ICON = 'w-6 h-6 text-neutral-800 dark:text-neutral-200'

function PhraseCell({ phrase }: { phrase: DayPhrase | null }) {
    if (phrase === null) return <span className={MUTED}>—</span>
    const First = ICONS[phrase.first]
    const Second = phrase.second === null ? null : ICONS[phrase.second]
    return (
        <>
            <span className="flex items-center justify-center gap-1">
                <First className={ICON} aria-hidden />
                {Second && phrase.joiner === 'later' && (
                    <>
                        <ArrowRight className="w-4 h-4 text-neutral-500" aria-hidden />
                        <Second className={ICON} aria-hidden />
                    </>
                )}
                {/* 「時々」は従の天気を小さく添える */}
                {Second && phrase.joiner === 'sometimes' && (
                    <Second className="w-4 h-4 self-start text-neutral-800 dark:text-neutral-200" aria-hidden />
                )}
            </span>
            <span className="block text-sm text-neutral-800 dark:text-neutral-200">
                {LABELS[phrase.first]}
                {phrase.second !== null && phrase.joiner !== null && `${JOINERS[phrase.joiner]}${LABELS[phrase.second]}`}
            </span>
        </>
    )
}

/** 最高と最低。並べるだけだと「2016」のような4桁に読めるので、° と / で区切る */
function TemperatureCell({ max, min }: { max: number | null; min: number | null }) {
    const format = (v: number | null) => (v === null ? '—' : `${Math.round(v)}°`)
    return (
        <span className="whitespace-nowrap">
            <span className="font-medium">{format(max)}</span>
            <span className="text-neutral-500"> / </span>
            <span className="text-neutral-700 dark:text-neutral-300">{format(min)}</span>
        </span>
    )
}

export function WeeklyTable({ days }: { days: WeeklyDay[] }) {
    return (
        <section className="rounded bg-neutral-200 dark:bg-neutral-800 overflow-hidden border border-neutral-400 dark:border-neutral-600">
            <h2 className="py-2 text-center font-medium bg-neutral-300 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-50">
                週間予報
            </h2>
            <table className="w-full table-fixed border-collapse text-center">
                <thead>
                    <tr>
                        {[['日付'], ['天気'], ['気温', '(℃)'], ['降水', '確率(%)'], ['降水量', '(mm)']].map((lines) => (
                            <th
                                key={lines[0]}
                                scope="col"
                                className="py-1 text-sm font-normal leading-tight align-middle text-neutral-700 dark:text-neutral-300 border-b border-neutral-400 dark:border-neutral-600"
                            >
                                {lines.map((line) => (
                                    <span key={line} className="block">
                                        {line}
                                    </span>
                                ))}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {days.map((day) => {
                        const [, m, d] = day.date.split('-').map(Number)
                        const isOff = day.weekday === 0 || day.weekday === 6 || day.holiday !== null
                        return (
                            <tr key={day.date} className={day.isToday ? 'bg-neutral-300 dark:bg-neutral-700' : undefined}>
                                <td className={`${CELL} text-left pl-2`}>
                                    {day.isToday && <span className="block text-sm text-amber-600 dark:text-amber-400">今日</span>}
                                    {m}/{d}
                                    {/* 土日祝。tenki.jp は青・赤で分けるが、配色はニュートラルとアンバーだけなのでアンバー1色 */}
                                    <span className={isOff ? 'text-amber-600 dark:text-amber-400' : undefined}>
                                        ({'日月火水木金土'[day.weekday]})
                                    </span>
                                    {day.holiday && (
                                        <span className="block text-sm text-neutral-700 dark:text-neutral-300">{day.holiday}</span>
                                    )}
                                </td>
                                <td className={CELL}>
                                    <PhraseCell phrase={day.phrase} />
                                </td>
                                <td className={CELL}>
                                    <TemperatureCell max={day.temperatureMax} min={day.temperatureMin} />
                                </td>
                                <td className={CELL}>
                                    <Amount value={day.precipitationProbability} />
                                </td>
                                <td className={CELL}>
                                    <Amount value={day.precipitation} />
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </section>
    )
}
