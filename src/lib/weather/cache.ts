/**
 * /weather の予報をブラウザ(localStorage)に置いておく(2026-11-13。頻繁に開くので、開くたびに Open-Meteo を叩かない)。
 * 置いた予報が FRESH_MS 以内ならそのまま使って取りに行かず、それより古ければ手元の分をすぐ出しつつ裏で取り直す。
 * 手動の更新(PageHeader の更新ボタン)は常に取りに行く。
 * 予報は地点と timezone で決まるので、キーに入れて合わないものは使わない。今日が含まれない予報(日をまたいだ古い分)も使わない。
 * 保存に失敗しても(容量・プライベートモード)取得に戻るだけで、表示は壊れない。ログアウトで消す(clearWeatherCache)。
 * DB には置かない: 予報は数時間で古くなり、履歴を残す用途が無い。端末をまたいで共有したくなったら再検討する。
 */
import type { OpenMeteoForecast } from './forecast'

const KEY = 'monocore:weather-cache'

/** Open-Meteo のモデルは1時間ごとに更新される。これより新しい分は取り直さない。 */
export const FRESH_MS = 30 * 60 * 1000

type CachedForecast = {
    /** 地点と timezone の指紋。変わったら別物として捨てる。 */
    key: string
    fetchedAt: number
    forecast: OpenMeteoForecast
}

export function weatherCacheKey(latitude: number, longitude: number, timezone: string): string {
    return `${latitude},${longitude},${timezone}`
}

function isCachedForecast(value: unknown): value is CachedForecast {
    if (!value || typeof value !== 'object') return false
    const v = value as Record<string, unknown>
    const f = v.forecast as Partial<OpenMeteoForecast> | undefined
    return typeof v.key === 'string' && typeof v.fetchedAt === 'number' && Array.isArray(f?.hourly?.time) && Array.isArray(f?.daily?.time)
}

/** 使える手元の予報と、それがまだ新しいか。使えなければ null。today は 'YYYY-MM-DD'。 */
export function readWeatherCache(key: string, today: string, now: number): { forecast: OpenMeteoForecast; isFresh: boolean } | null {
    try {
        const raw = window.localStorage.getItem(KEY)
        if (!raw) return null
        const parsed: unknown = JSON.parse(raw)
        if (!isCachedForecast(parsed) || parsed.key !== key) return null
        if (!parsed.forecast.daily.time.includes(today)) return null
        const age = now - parsed.fetchedAt
        // 時計が戻って未来の取得時刻になっていたら信用しない
        if (age < 0) return null
        return { forecast: parsed.forecast, isFresh: age < FRESH_MS }
    } catch {
        return null
    }
}

export function writeWeatherCache(key: string, forecast: OpenMeteoForecast, now: number): void {
    try {
        window.localStorage.setItem(KEY, JSON.stringify({ key, fetchedAt: now, forecast } satisfies CachedForecast))
    } catch {
        // 置けなければ置かない。
    }
}

export function clearWeatherCache(): void {
    try {
        window.localStorage.removeItem(KEY)
    } catch {
        // 消せなくても表示には影響しない。
    }
}
