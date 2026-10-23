'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/database.types';
import { addMonths, fromMonthDate, toMonthDate } from '@/src/lib/finance/month';
import { parseEvent, parseMeasurement, type EventDraft, type MeasurementDraft } from '@/src/lib/finance/input';
import { forecastAt, latestMeasurement, project, summarize, type FinanceEvent, type Measurement } from '@/src/lib/finance/projection';
import {
    getFinanceEvents, getFinanceMeasurements, insertFinanceEvent, updateFinanceEvent,
    deleteFinanceEvent, upsertFinanceMeasurement, type FinanceEventRow,
} from '@/src/lib/supabase/queries/finance';

type Event = FinanceEvent & { id: string; updatedAt: string };

function eventFromRow(row: FinanceEventRow): Event {
    return { id: row.id, updatedAt: row.updated_at, name: row.name, start: fromMonthDate(row.start_month), end: row.end_month ? fromMonthDate(row.end_month) : null, cash: row.cash_delta, nisa: row.nisa_delta, memo: row.memo };
}

const CONFLICT_MESSAGE = 'この行は別の場所(別タブや CLI)で変更されています。表を最新にしたので、下書きを見直してから保存し直してください。';

function message(error: unknown): string {
    return error instanceof Error ? error.message : '保存に失敗しました。下書きを残しています。';
}

export function useFinance(client: SupabaseClient<Database>) {
    const [events, setEvents] = useState<Event[]>([]);
    const [measurements, setMeasurements] = useState<Measurement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
    const [eventError, setEventError] = useState<string | null>(null);
    const [measurementDraft, setMeasurementDraft] = useState<MeasurementDraft | null>(null);
    const [editingMonth, setEditingMonth] = useState<string | null>(null);
    const [measurementError, setMeasurementError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const busy = useRef(false);

    /** 両表を DB から取り直す。下書き(eventDraft / measurementDraft)には触れない。読んだ計画を返す。 */
    const fetchAll = useCallback(async (): Promise<Event[]> => {
        const [ev, ms] = await Promise.all([getFinanceEvents(client), getFinanceMeasurements(client)]);
        if (ev.error || ms.error) throw new Error('家計の読み込みに失敗しました。再読み込みしてください。');
        const loadedEvents = ev.data.map(eventFromRow);
        const loadedMeasurements = ms.data.map(row => ({ month: fromMonthDate(row.month), cash: row.cash, nisa: row.nisa }));
        latestMeasurement(loadedMeasurements);
        setEvents(loadedEvents);
        setMeasurements(loadedMeasurements);
        return loadedEvents;
    }, [client]);

    const reload = useCallback(async () => {
        setIsLoading(true);
        try {
            try { await fetchAll(); }
            catch {
                // 初回表示でセッション確立と同時に投げた要求が 401 になることがある(他ページでも起きる)。1回だけ待って取り直す。
                await new Promise(resolve => setTimeout(resolve, 500));
                await fetchAll();
            }
            setLoadError(null);
        } catch (error) { setLoadError(message(error)); }
        finally { setIsLoading(false); }
    }, [fetchAll]);

    /** 保存後・タブ復帰時の静かな同期。失敗しても画面は今のままにする(次の操作か再読み込みで直る)。 */
    const refresh = useCallback(async (): Promise<Event[] | null> => {
        try { return await fetchAll(); } catch { return null; /* 表示中の値を保つ */ }
    }, [fetchAll]);

    useEffect(() => { void reload(); }, [reload]);

    const base = latestMeasurement(measurements);
    const nextMonth = base ? addMonths(base.month, 1) : new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7);
    const recordDraft = measurementDraft ?? { month: nextMonth, cash: '', nisa: '' };

    const simulation = useMemo(() => {
        let previewEvents: FinanceEvent[] = events;
        try {
            if (eventDraft) {
                const draft = parseEvent(eventDraft);
                previewEvents = eventDraft.id ? events.map(event => event.id === eventDraft.id ? draft : event) : [...events, draft];
            }
            return { events: previewEvents, rows: project(measurements, previewEvents), summary: summarize(measurements, previewEvents), error: null };
        } catch (error) {
            // An incomplete draft must not replace the table with invalid numeric values.
            try {
                return { events, rows: project(measurements, events), summary: summarize(measurements, events), error: message(error) };
            } catch (storedError) {
                return { events, rows: [], summary: null, error: message(storedError) };
            }
        }
    }, [events, measurements, eventDraft]);

    // 編集開始時点の updated_at を下書きに固定する。背景の refresh で events が入れ替わっても、
    // 楽観ロックの条件は「自分が見て編集を始めた版」でなければ他所の変更を黙って上書きしうる。
    const draftUpdatedAt = useRef<string | null>(null);

    function editEvent(event?: Event) {
        if (eventDraft || saving || editingMonth) return;
        setEventError(null);
        draftUpdatedAt.current = event?.updatedAt ?? null;
        setEventDraft(event ? { ...event, end: event.end ?? '', cash: String(event.cash), nisa: String(event.nisa), memo: event.memo ?? '' }
            : { id: null, name: '', start: recordDraft.month, end: '', cash: '0', nisa: '0', memo: '' });
    }

    async function saveEvent() {
        if (!eventDraft || busy.current) return;
        busy.current = true;
        setSaving(true);
        setEventError(null);
        try {
            const event = parseEvent(eventDraft);
            const preview = eventDraft.id ? events.map(row => row.id === eventDraft.id ? event : row) : [...events, event];
            project(measurements, preview);
            const input = { name: event.name, start_month: toMonthDate(event.start), end_month: event.end ? toMonthDate(event.end) : null, cash_delta: event.cash, nisa_delta: event.nisa, memo: event.memo ?? '' };
            if (eventDraft.id && !draftUpdatedAt.current) {
                // 条件を持たないまま更新に進まない(空文字の日時条件は形式エラーで永久に失敗する)。取り直してから。
                const loaded = await refresh();
                const latest = loaded?.find(row => row.id === eventDraft.id);
                if (!loaded) throw new Error('表を取り直せませんでした。通信が戻ったらもう一度保存してください。');
                if (!latest) throw new Error('この行は別の場所で削除されています。取消してから、必要なら「+ 追加」で入れ直してください。');
                draftUpdatedAt.current = latest.updatedAt;
            }
            const result = eventDraft.id
                ? await updateFinanceEvent(client, eventDraft.id, draftUpdatedAt.current ?? '', input)
                : await insertFinanceEvent(client, input);
            if (result.error) throw new Error('計画の保存に失敗しました。下書きを残しています。');
            if (!result.data) {
                // 楽観ロックに外れた(0 行更新)。下書きは残し、表だけ最新にする。
                // 次の保存は新しい版を条件にできるよう、取り直した行の updated_at に付け替える。
                // 取り直し自体に失敗したら条件は今のまま残す(次の保存でまた競合→取り直しを試みる)。
                const loaded = await refresh();
                if (!loaded) throw new Error('保存が競合しましたが、表を取り直せませんでした。通信が戻ったらもう一度保存してください。');
                const latest = loaded.find(row => row.id === eventDraft.id);
                if (!latest) throw new Error('この行は別の場所で削除されています。取消してから、必要なら「+ 追加」で入れ直してください。');
                draftUpdatedAt.current = latest.updatedAt;
                throw new Error(CONFLICT_MESSAGE);
            }
            const saved = eventFromRow(result.data);
            setEvents(rows => eventDraft.id ? rows.map(row => row.id === saved.id ? saved : row) : [...rows, saved]);
            setEventDraft(null);
            await refresh();
        } catch (error) { setEventError(message(error)); }
        finally { busy.current = false; setSaving(false); }
    }

    async function removeEvent() {
        if (!eventDraft?.id || busy.current) return;
        busy.current = true;
        setSaving(true);
        setEventError(null);
        try {
            project(measurements, events.filter(row => row.id !== eventDraft.id));
            const { error } = await deleteFinanceEvent(client, eventDraft.id);
            if (error) throw new Error('計画の削除に失敗しました。下書きを残しています。');
            setEvents(rows => rows.filter(row => row.id !== eventDraft.id));
            setEventDraft(null);
            await refresh();
        } catch (error) { setEventError(message(error)); }
        finally { busy.current = false; setSaving(false); }
    }

    function editMeasurement(row: Measurement) {
        if (eventDraft || saving || editingMonth) return;
        setMeasurementError(null);
        setEditingMonth(row.month);
        setMeasurementDraft({ month: row.month, cash: String(row.cash), nisa: String(row.nisa) });
    }

    async function record() {
        if (eventDraft || busy.current) return;
        busy.current = true;
        setSaving(true);
        setMeasurementError(null);
        try {
            const row = parseMeasurement(recordDraft);
            const next = [...measurements.filter(old => old.month !== row.month), row].sort((a, b) => a.month.localeCompare(b.month));
            project(next, events);
            const result = await upsertFinanceMeasurement(client, { month: toMonthDate(row.month), cash: row.cash, nisa: row.nisa });
            if (result.error || !result.data) throw new Error('実測の保存に失敗しました。入力を残しています。');
            setMeasurements(next);
            setMeasurementDraft(null);
            setEditingMonth(null);
            // 別タブや CLI が足した実測・計画を取り込む(起点が DB と食い違わないように)。
            await refresh();
        } catch (error) { setMeasurementError(message(error)); }
        finally { busy.current = false; setSaving(false); }
    }

    // タブに戻ってきたとき、下書き中でなければ両表を取り直す。
    const idle = !eventDraft && !measurementDraft && !saving;
    useEffect(() => {
        if (!idle) return;
        const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [idle, refresh]);

    let forecast = null;
    let forecastError = null;
    try { forecast = forecastAt(measurements, simulation.events, recordDraft.month); }
    catch (error) { forecastError = message(error); }

    return {
        events, measurements, base, isLoading, loadError, reload, saving,
        eventDraft, setEventDraft, eventError, editEvent, saveEvent, removeEvent,
        cancelEvent: () => { if (!saving) { setEventDraft(null); setEventError(null); } },
        recordDraft, setMeasurementDraft, measurementError, editMeasurement, record,
        cancelMeasurement: () => { if (!saving) { setMeasurementDraft(null); setEditingMonth(null); setMeasurementError(null); } },
        editingMonth, hasMeasurementDraft: !!measurementDraft,
        forecast, forecastError, simulation,
    };
}

export type FinanceState = ReturnType<typeof useFinance>;
