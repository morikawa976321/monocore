/**
 * /weather の予報。Open-Meteo(https://open-meteo.com/)からブラウザで直接取る。
 * tenki.jp は利用規約第8条でブラウザ以外での取得を禁じ、iframe も X-Frame-Options で拒むので使わない。
 * Open-Meteo はキー不要・CORS 許可(Access-Control-Allow-Origin: *)で、表示には出典の明記が要る(CC BY 4.0)。
 */

export const WEATHER_LOCATION = { name: '目黒区', latitude: 35.6415, longitude: 139.6982 } as const

const HOURLY_FIELDS = [
    'weather_code',
    'temperature_2m',
    'precipitation_probability',
    'precipitation',
    'snowfall',
    'relative_humidity_2m',
    'wind_speed_10m',
    'wind_direction_10m',
] as const

type HourlyField = (typeof HOURLY_FIELDS)[number]

export type OpenMeteoForecast = {
    hourly: { time: string[] } & Record<HourlyField, (number | null)[]>
    daily: { time: string[]; sunrise: string[]; sunset: string[] }
}

export async function fetchForecast(timezone: string): Promise<OpenMeteoForecast> {
    const params = new URLSearchParams({
        latitude: String(WEATHER_LOCATION.latitude),
        longitude: String(WEATHER_LOCATION.longitude),
        timezone,
        // 既定は km/h。tenki.jp と同じ m/s で受け取る
        wind_speed_unit: 'ms',
        hourly: HOURLY_FIELDS.join(','),
        daily: 'sunrise,sunset',
        // 今日の残りと明日。モデルを指定すると降水確率が欠けるので(気象庁モデルは null)既定の組み合わせのまま
        forecast_days: '2',
    })
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
    return (await res.json()) as OpenMeteoForecast
}

export type WeatherHourRow = {
    kind: 'hour'
    hour: number
    isCurrent: boolean
    isNight: boolean
    weatherCode: number | null
    temperature: number | null
    precipitationProbability: number | null
    precipitation: number | null
    snowfall: number | null
    humidity: number | null
    windSpeed: number | null
    windDirection: number | null
}

export type WeatherSunRow = { kind: 'sunrise' | 'sunset'; time: string }

export type WeatherDay = { date: string; rows: (WeatherHourRow | WeatherSunRow)[] }

/** "2026-10-27T05:58" → 分。Open-Meteo の時刻は指定した timezone の現地時刻で、オフセットを持たない */
function minutesOf(localIso: string): number {
    return parseInt(localIso.slice(11, 13), 10) * 60 + parseInt(localIso.slice(14, 16), 10)
}

/**
 * 今の時刻の行から明日の終わりまでを日ごとに分け、日の出・日の入りの行をその時刻を含む行の直後に差し込む。
 * 過ぎた日の出・日の入りは出さない。today は 'YYYY-MM-DD'、nowMinutes は 0 時からの分(どちらも予報と同じ timezone)。
 */
export function buildWeatherDays(forecast: OpenMeteoForecast, today: string, nowMinutes: number): WeatherDay[] {
    const { hourly, daily } = forecast
    const currentHour = Math.floor(nowMinutes / 60)
    const sun = new Map(daily.time.map((date, i) => [date, { sunrise: daily.sunrise[i], sunset: daily.sunset[i] }]))
    const days: WeatherDay[] = []

    hourly.time.forEach((time, i) => {
        const date = time.slice(0, 10)
        const hour = parseInt(time.slice(11, 13), 10)
        if (date < today || (date === today && hour < currentHour)) return

        let day = days[days.length - 1]
        if (!day || day.date !== date) {
            day = { date, rows: [] }
            days.push(day)
        }

        const s = sun.get(date)
        const start = hour * 60
        // 行の始まりが日の出前か日の入り後なら夜(5:58 日の出なら5時台は夜、16:50 日の入りなら16時台は昼)
        const isNight = s ? start < minutesOf(s.sunrise) || start >= minutesOf(s.sunset) : false
        day.rows.push({
            kind: 'hour',
            hour,
            isCurrent: date === today && hour === currentHour,
            isNight,
            weatherCode: hourly.weather_code[i],
            temperature: hourly.temperature_2m[i],
            precipitationProbability: hourly.precipitation_probability[i],
            precipitation: hourly.precipitation[i],
            snowfall: hourly.snowfall[i],
            humidity: hourly.relative_humidity_2m[i],
            windSpeed: hourly.wind_speed_10m[i],
            windDirection: hourly.wind_direction_10m[i],
        })

        if (!s) return
        for (const kind of ['sunrise', 'sunset'] as const) {
            const m = minutesOf(s[kind])
            if (Math.floor(m / 60) === hour && !(date === today && m < nowMinutes)) {
                day.rows.push({ kind, time: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` })
            }
        }
    })
    return days
}

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder' | 'unknown'

/** WMO 天気コード(Open-Meteo の weather_code)→ 表示の種類と日本語ラベル */
export function describeWeather(code: number | null): { kind: WeatherKind; label: string } {
    if (code === null) return { kind: 'unknown', label: '—' }
    if (code <= 1) return { kind: 'clear', label: '晴れ' }
    if (code === 2) return { kind: 'partly', label: '一部曇り' }
    if (code === 3) return { kind: 'cloudy', label: '曇り' }
    if (code === 45 || code === 48) return { kind: 'fog', label: '霧' }
    if (code >= 51 && code <= 57) return { kind: 'drizzle', label: '霧雨' }
    if (code === 61) return { kind: 'rain', label: '小雨' }
    if (code === 63 || code === 66 || code === 67) return { kind: 'rain', label: '雨' }
    if (code === 65) return { kind: 'rain', label: '強雨' }
    if (code === 71) return { kind: 'snow', label: '小雪' }
    if (code === 73 || code === 77) return { kind: 'snow', label: '雪' }
    if (code === 75) return { kind: 'snow', label: '大雪' }
    if (code === 80 || code === 81) return { kind: 'rain', label: 'にわか雨' }
    if (code === 82) return { kind: 'rain', label: '強雨' }
    if (code === 85 || code === 86) return { kind: 'snow', label: 'にわか雪' }
    if (code >= 95) return { kind: 'thunder', label: '雷雨' }
    return { kind: 'unknown', label: '—' }
}

const DIRECTIONS = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西']

/** 風が吹いてくる方角(度)→ 16方位 */
export function windDirectionLabel(degrees: number): string {
    return DIRECTIONS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16]
}

/** "2026-10-27" → "2026年10月27日(火)" */
export function formatDayHeading(date: string): string {
    const [y, m, d] = date.split('-').map(Number)
    const weekday = '日月火水木金土'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
    return `${y}年${m}月${d}日(${weekday})`
}
