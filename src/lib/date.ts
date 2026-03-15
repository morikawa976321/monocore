import { fromZonedTime, toZonedTime } from 'date-fns-tz'

/**
 * 実行環境の IANA タイムゾーン名を返す。
 * - ブラウザ: ユーザーの OS 設定に基づくタイムゾーン（例: "Asia/Tokyo"）
 * - Node（SSR 等）: サーバーのタイムゾーン。ユーザーごとのタイムゾーンが必要な場合は
 *   クライアントで取得するか、ユーザー設定として保持すること。
 */
export function getDefaultTimezone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * 指定タイムゾーンの「その日・その時刻」を UTC の ISO 文字列で返す。
 * @param date YYYY-MM-DD
 * @param hhmm 4 桁 "0930"。翌日 0:00 は "2400"
 * @param timezone IANA タイムゾーン
 */
export function localTimeToUtc(
    date: string,
    hhmm: string,
    timezone: string
): string {
    const [y, m, d] = date.split('-').map(Number)
    const hours = parseInt(hhmm.slice(0, 2), 10)
    const minutes = parseInt(hhmm.slice(2, 4), 10)
    const local = new Date(y, m - 1, d, hours, minutes, 0)
    const utc = fromZonedTime(local, timezone)
    return utc.toISOString()
}

/**
 * UTC の ISO 文字列を、指定タイムゾーンの「日付・時刻」に変換する。
 * localTimeToUtc の逆変換。表示用の日付・時刻を取得するときに使う。
 * @param utcIso UTC の ISO 8601 文字列（例: "2026-03-15T00:30:00.000Z"）
 * @param timezone IANA タイムゾーン
 * @returns そのタイムゾーンでの date (YYYY-MM-DD) と hhmm (4桁 "0930")
 */
export function utcToLocalTime(
    utcIso: string,
    timezone: string
): { date: string; hhmm: string } {
    const zoned = toZonedTime(new Date(utcIso), timezone)
    const y = zoned.getFullYear()
    const m = String(zoned.getMonth() + 1).padStart(2, '0')
    const d = String(zoned.getDate()).padStart(2, '0')
    const h = String(zoned.getHours()).padStart(2, '0')
    const min = String(zoned.getMinutes()).padStart(2, '0')
    return {
        date: `${y}-${m}-${d}`,
        hhmm: `${h}${min}`,
    }
}
