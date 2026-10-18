'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/database.types';
import { getDefaultTimezone, localTimeToUtc, utcToLocalTime } from '@/src/lib/date';
import { addDays } from '@/src/lib/schedules/free-time';
import { scheduleRowsToDayContent, type ScheduleRow } from '@/src/lib/schedules/text-format';
import { getDefaultAppliedDays, getSchedulesAllPages } from '@/src/lib/supabase/queries/schedules';

/**
 * startDay から days 日分の予定を「日付 → 予定テキスト」で読む（読み取り専用）。startDay が null か
 * days が 0 なら読まない。スケジュール画面と違って既定予定（apply_default_schedules）は書き込まない。
 * まだ画面で開いていない日は起床・消灯の行が無いので、空き時間の計算はその日だけ既定の 0700 起床・
 * 2200-2300 消灯で補う。開いたかは loadedDays（既定予定を書き込んだ記録のある日）で分かる。
 */
export function usePlanDayContents(supabase: SupabaseClient<Database>, startDay: string | null, days: number) {
    const [contents, setContents] = useState<Map<string, string>>(new Map());
    const [loadedDays, setLoadedDays] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // 範囲が変わって読み直したとき、先に出した古い要求の応答で上書きしないための番号。
    const requestIdRef = useRef(0);

    const reload = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        if (!startDay || days <= 0) {
            setContents(new Map());
            setLoadedDays(new Set());
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        const tz = getDefaultTimezone();
        const endDay = addDays(startDay, days);
        const [{ data, error: e }, applied] = await Promise.all([
            getSchedulesAllPages(supabase, localTimeToUtc(startDay, '0000', tz), localTimeToUtc(endDay, '0000', tz)),
            getDefaultAppliedDays(supabase, startDay, addDays(endDay, -1)),
        ]);
        if (requestId !== requestIdRef.current) return;
        if (e || applied.error) {
            setError('予定の読み込みに失敗しました。');
        } else {
            // 行を先に1回だけ日付へ振り分ける（日ごとに全行を変換し直すと 日数×行数 回になる）。
            const byDate = new Map<string, ScheduleRow[]>();
            for (const row of data ?? []) {
                const date = utcToLocalTime(row.start_at, tz).date;
                const list = byDate.get(date);
                if (list) list.push(row);
                else byDate.set(date, [row]);
            }
            const next = new Map<string, string>();
            for (let d = startDay; d < endDay; d = addDays(d, 1)) {
                next.set(d, scheduleRowsToDayContent(byDate.get(d) ?? [], d, tz));
            }
            setContents(next);
            setLoadedDays(applied.data ?? new Set());
            setError(null);
        }
        setIsLoading(false);
    }, [supabase, startDay, days]);

    useEffect(() => {
        void reload();
    }, [reload]);

    return { contents, loadedDays, isLoading, error, reload };
}
