import holiday_jp from '@holiday-jp/holiday_jp'
import type { OpenMeteoForecast } from './forecast'

/** 週間予報の天気は tenki.jp と同じく 晴・曇・雨・雪 の4つに丸める */
export type DayWeather = 'sun' | 'cloud' | 'rain' | 'snow'

/** 1日の天気の言い方。joiner が null なら first だけ(「晴」)、'later' は「AのちB」、'sometimes' は「A時々B」 */
export type DayPhrase = { first: DayWeather; second: DayWeather | null; joiner: 'later' | 'sometimes' | null }

export type WeeklyDay = {
    date: string
    isToday: boolean
    /** 0=日曜 … 6=土曜 */
    weekday: number
    holiday: string | null
    phrase: DayPhrase | null
    temperatureMax: number | null
    temperatureMin: number | null
    precipitationProbability: number | null
    precipitation: number | null
}

const SEVERITY: Record<DayWeather, number> = { sun: 0, cloud: 1, rain: 2, snow: 3 }

/** WMO 天気コード → 4区分。霧(45/48)は曇、霧雨も雨に数える */
export function dayWeatherOf(code: number): DayWeather {
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
    if (code >= 51) return 'rain'
    if (code >= 3) return 'cloud'
    return 'sun'
}

/** 時間数が最も多い区分。同数なら悪い方(雪 > 雨 > 曇 > 晴) */
function dominant(counts: Map<DayWeather, number>): DayWeather | null {
    let best: DayWeather | null = null
    for (const [w, n] of counts) {
        const b = best === null ? 0 : counts.get(best)!
        if (best === null || n > b || (n === b && SEVERITY[w] > SEVERITY[best])) best = w
    }
    return best
}

function countOf(codes: (number | null)[]): Map<DayWeather, number> {
    const counts = new Map<DayWeather, number>()
    for (const c of codes) {
        if (c === null) continue
        const w = dayWeatherOf(c)
        counts.set(w, (counts.get(w) ?? 0) + 1)
    }
    return counts
}

/**
 * その日の0〜23時の天気コードから「晴のち曇」「曇時々晴」を作る。Open-Meteo の日ごとの weather_code は
 * その日で最も悪い1つだけなので使わない。規則は AI がモックで示し、本人がそのまま採ったもの(2026-10-27、docs/decisions.md):
 * 6〜11時と12〜17時で最も多い区分が違えば「のち」、同じで、6〜17時に別の区分が2時間以上あれば「時々」。
 */
export function phraseOfDay(hourCodes: (number | null)[]): DayPhrase | null {
    const morning = dominant(countOf(hourCodes.slice(6, 12)))
    const afternoon = dominant(countOf(hourCodes.slice(12, 18)))
    if (morning === null || afternoon === null) return null
    if (morning !== afternoon) return { first: morning, second: afternoon, joiner: 'later' }

    const daytime = countOf(hourCodes.slice(6, 18))
    daytime.delete(morning)
    const other = dominant(daytime)
    if (other !== null && daytime.get(other)! >= 2) return { first: morning, second: other, joiner: 'sometimes' }
    return { first: morning, second: null, joiner: null }
}

const HOLIDAYS = holiday_jp.holidays as Record<string, { name: string } | undefined>

export function buildWeeklyDays(forecast: OpenMeteoForecast, today: string): WeeklyDay[] {
    const { hourly, daily } = forecast
    const codesByDate = new Map<string, (number | null)[]>()
    hourly.time.forEach((time, i) => {
        const date = time.slice(0, 10)
        const codes = codesByDate.get(date) ?? []
        codes[parseInt(time.slice(11, 13), 10)] = hourly.weather_code[i]
        codesByDate.set(date, codes)
    })

    return daily.time.flatMap((date, i) => {
        if (date < today) return []
        const [y, m, d] = date.split('-').map(Number)
        return [
            {
                date,
                isToday: date === today,
                weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
                holiday: HOLIDAYS[date]?.name ?? null,
                phrase: phraseOfDay(Array.from({ length: 24 }, (_, h) => codesByDate.get(date)?.[h] ?? null)),
                temperatureMax: daily.temperature_2m_max[i],
                temperatureMin: daily.temperature_2m_min[i],
                precipitationProbability: daily.precipitation_probability_max[i],
                precipitation: daily.precipitation_sum[i],
            },
        ]
    })
}
