'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'monocore.plan.lifeHoursPerDay';

/**
 * 1日あたり差し引く生活の時間（食事・移動・風呂など予定に書かない時間）。既定は 0。
 * 値は本人が実感か実測で決めるもので、アプリは仮の値を置かない（docs/decisions.md の /plan）。
 * 端末ごとの表示設定として localStorage に置く（DB に持つほどの共有性が要るかは未判断）。
 */
export function useLifeHours(): [number, (hours: number) => void] {
    const [hours, setHours] = useState(0);

    useEffect(() => {
        try {
            const saved = Number(localStorage.getItem(STORAGE_KEY));
            if (Number.isFinite(saved) && saved >= 0) setHours(saved);
        } catch {
            // 保存領域が使えない環境では既定値のまま
        }
    }, []);

    const update = useCallback((next: number) => {
        setHours(next);
        try {
            localStorage.setItem(STORAGE_KEY, String(next));
        } catch {
            // 保存できなくても今の表示には反映する
        }
    }, []);

    return [hours, update];
}
