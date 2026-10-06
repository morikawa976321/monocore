'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/database.types';
import { getDefaultTimezone, localTimeToUtc } from '@/src/lib/date';
import { addDays } from '@/src/lib/schedules/free-time';
import { scheduleRowsToDayContent } from '@/src/lib/schedules/text-format';
import { getSchedulesAllPages } from '@/src/lib/supabase/queries/schedules';

/**
 * startDay から days 日分の予定を「日付 → 予定テキスト」で読む（読み取り専用）。startDay が null か
 * days が 0 なら読まない。スケジュール画面と違って既定予定（apply_default_schedules）は書き込まない。
 * まだ画面で開いていない日は起床・消灯の行が無いが、空き時間の計算は既定の 07:00〜23:30 で補う。
 */
export function usePlanDayContents(supabase: SupabaseClient<Database>, startDay: string | null, days: number) {
    const [contents, setContents] = useState<Map<string, string>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!startDay || days <= 0) {
            setContents(new Map());
            setIsLoading(false);
            return;
        }
        const tz = getDefaultTimezone();
        const endDay = addDays(startDay, days);
        const { data, error: e } = await getSchedulesAllPages(
            supabase,
            localTimeToUtc(startDay, '0000', tz),
            localTimeToUtc(endDay, '0000', tz)
        );
        if (e) {
            setError('予定の読み込みに失敗しました。');
        } else {
            const next = new Map<string, string>();
            for (let d = startDay; d < endDay; d = addDays(d, 1)) {
                next.set(d, scheduleRowsToDayContent(data ?? [], d, tz));
            }
            setContents(next);
            setError(null);
        }
        setIsLoading(false);
    }, [supabase, startDay, days]);

    useEffect(() => {
        void reload();
    }, [reload]);

    return { contents, isLoading, error, reload };
}
