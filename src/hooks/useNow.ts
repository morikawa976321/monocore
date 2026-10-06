'use client';

import { useEffect, useState } from 'react';
import { getDefaultTimezone, utcToLocalTime } from '@/src/lib/date';

type Now = { today: string; nowMinutes: number };

function readNow(timezone: string): Now {
    const { date, hhmm } = utcToLocalTime(new Date().toISOString(), timezone);
    return { today: date, nowMinutes: parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(2, 4), 10) };
}

/**
 * 今日の日付（ローカル）と今の時刻（分）。1分ごとに更新する。
 * サーバ描画と時計がずれて hydration が食い違わないよう、マウントまでは null。
 */
export function useNow(): Now | null {
    const [now, setNow] = useState<Now | null>(null);
    useEffect(() => {
        const tz = getDefaultTimezone();
        setNow(readNow(tz));
        const id = setInterval(() => setNow(readNow(tz)), 60 * 1000);
        return () => clearInterval(id);
    }, []);
    return now;
}
