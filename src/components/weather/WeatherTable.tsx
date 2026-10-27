import {
    ArrowDown,
    Cloud,
    CloudDrizzle,
    CloudFog,
    CloudLightning,
    CloudMoon,
    CloudRain,
    CloudSnow,
    CloudSun,
    Moon,
    Sun,
    Sunrise,
    Sunset,
    type LucideIcon,
} from 'lucide-react'
import {
    describeWeather,
    formatDayHeading,
    windDirectionLabel,
    type WeatherDay,
    type WeatherHourRow,
    type WeatherKind,
} from '@/src/lib/weather/forecast'

const ICONS: Record<WeatherKind, { day: LucideIcon; night: LucideIcon }> = {
    clear: { day: Sun, night: Moon },
    partly: { day: CloudSun, night: CloudMoon },
    cloudy: { day: Cloud, night: Cloud },
    fog: { day: CloudFog, night: CloudFog },
    drizzle: { day: CloudDrizzle, night: CloudDrizzle },
    rain: { day: CloudRain, night: CloudRain },
    snow: { day: CloudSnow, night: CloudSnow },
    thunder: { day: CloudLightning, night: CloudLightning },
    unknown: { day: Cloud, night: Cloud },
}

const CELL = 'py-2 border-b border-neutral-300 dark:border-neutral-700'
const MUTED = 'text-neutral-500'

/** 降水量・降雪量。0 は薄く出して、降る行を目立たせる */
function Amount({ value }: { value: number | null }) {
    if (value === null) return <span className={MUTED}>—</span>
    if (value === 0) return <span className={MUTED}>0</span>
    return <>{Number.isInteger(value) ? value : value.toFixed(1)}</>
}

function HourRow({ row }: { row: WeatherHourRow }) {
    const weather = describeWeather(row.weatherCode)
    const Icon = ICONS[weather.kind][row.isNight ? 'night' : 'day']
    return (
        <tr className={row.isCurrent ? 'bg-neutral-300 dark:bg-neutral-700' : undefined}>
            <td className={`${CELL} ${row.isCurrent ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-neutral-700 dark:text-neutral-300'}`}>
                {String(row.hour).padStart(2, '0')}
            </td>
            <td className={CELL}>
                <Icon className="w-6 h-6 mx-auto text-neutral-800 dark:text-neutral-200" aria-hidden />
                <span className="block text-sm text-neutral-800 dark:text-neutral-200">{weather.label}</span>
            </td>
            <td className={CELL}>{row.temperature === null ? <span className={MUTED}>—</span> : Math.round(row.temperature)}</td>
            <td className={CELL}>
                <Amount value={row.precipitationProbability} />
            </td>
            <td className={CELL}>
                <Amount value={row.precipitation} />
            </td>
            <td className={CELL}>
                <Amount value={row.snowfall} />
            </td>
            <td className={CELL}>{row.humidity ?? <span className={MUTED}>—</span>}</td>
            <td className={CELL}>
                {row.windSpeed === null || row.windDirection === null ? (
                    <span className={MUTED}>—</span>
                ) : (
                    <>
                        <span className="inline-flex items-center gap-1">
                            {/* 矢印は風が吹いていく向き。風向(吹いてくる方角)が北=0度なら下向き */}
                            <ArrowDown
                                className="w-4 h-4 text-neutral-700 dark:text-neutral-300"
                                style={{ transform: `rotate(${row.windDirection}deg)` }}
                                aria-hidden
                            />
                            {Math.round(row.windSpeed)}
                        </span>
                        <span className="block text-sm text-neutral-800 dark:text-neutral-200">
                            {windDirectionLabel(row.windDirection)}
                        </span>
                    </>
                )}
            </td>
        </tr>
    )
}

const HEADINGS = [
    ['時刻'],
    ['天気'],
    ['気温', '(℃)'],
    ['降水', '確率', '(%)'],
    ['降水量', '(mm/h)'],
    ['降雪量', '(cm/h)'],
    ['湿度', '(%)'],
    ['風向', '風速', '(m/s)'],
]

export function WeatherTable({ days, today }: { days: WeatherDay[]; today: string }) {
    return (
        <div className="space-y-4">
            {days.map((day) => (
                <section
                    key={day.date}
                    className="rounded bg-neutral-200 dark:bg-neutral-800 overflow-hidden border border-neutral-400 dark:border-neutral-600"
                >
                    <h2 className="py-2 text-center font-medium bg-neutral-300 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-50">
                        {day.date === today ? '今日' : '明日'} {formatDayHeading(day.date)}
                    </h2>
                    <table className="w-full table-fixed border-collapse text-center">
                        <thead>
                            <tr>
                                {HEADINGS.map((lines) => (
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
                            {day.rows.map((row) =>
                                row.kind === 'hour' ? (
                                    <HourRow key={row.hour} row={row} />
                                ) : (
                                    <tr key={row.kind}>
                                        <td
                                            colSpan={8}
                                            className="py-1 text-sm text-amber-600 dark:text-amber-400 border-b border-neutral-300 dark:border-neutral-700"
                                        >
                                            <span className="inline-flex items-center gap-2">
                                                {row.kind === 'sunrise' ? (
                                                    <Sunrise className="w-4 h-4" aria-hidden />
                                                ) : (
                                                    <Sunset className="w-4 h-4" aria-hidden />
                                                )}
                                                {row.kind === 'sunrise' ? '日の出' : '日の入り'} {row.time}
                                            </span>
                                        </td>
                                    </tr>
                                )
                            )}
                        </tbody>
                    </table>
                </section>
            ))}
        </div>
    )
}
