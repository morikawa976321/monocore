'use client';

import {
    useState,
    useRef,
    useEffect,
    useLayoutEffect,
    useMemo,
    useCallback,
    type RefObject,
} from 'react';
import { addDays, addMonths, subMonths, parseISO, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/database.types';
import {
    applyDefaultSchedules,
    getDefaultAppliedDays,
    getScheduleDayRevisions,
    getSchedules,
    getScheduleDayRevisionsStamp,
    getSchedulesStamp,
    replaceSchedulesForDay,
} from '@/src/lib/supabase/queries/schedules';
import type { NotesLoadResult } from '@/src/hooks/useDayNotes';
import { getScheduleDayNotesStamp } from '@/src/lib/supabase/queries/schedule-day-notes';
import { getDefaultTimezone, localTimeToUtc } from '@/src/lib/date';
import {
    dateLabelToDateStr,
    dayContentToScheduleItems,
    findDayContentIssues,
    generateDayEntries,
    mergeSchedulesIntoEntries,
    type DayEntry,
} from '@/src/lib/schedules/text-format';
import {
    applyScheduleRevisions,
    decodeScheduleSaveOutcome,
    ScheduleSaveQueue,
} from '@/src/lib/schedules/sync';

/**
 * 同じ日の自動保存が連続でこの回数失敗したら、その日の自動保存を打ち切る。
 * 失敗し続ける保存を無人でリトライすると、1クライアントがDBのエラーログだけで
 * インスタンスのDisk IOを飽和させる(2026-08-25の実障害)。人が編集し直せば解除される。
 */
const MAX_CONSECUTIVE_SAVE_FAILURES = 3;

/** 既定予定を書き込んだ記録を読み損ねた日があるときの表示。その日は前の判定のまま描かれる。再読み込みで直る。 */
const APPLIED_DAYS_ERROR = '既定予定の記録の読み込みに失敗しました（睡眠の帯が正しくない日があります）。';

type UseSchedulesCompanions = {
    loadNotes: (startDay: string, endDay: string) => Promise<NotesLoadResult | null>;
    flushPendingNoteSaves: () => void;
    hasPendingNoteChanges: boolean;
    hasPendingInboxChanges: boolean;
    saveInboxNow: () => void;
};

type UseSchedulesReturn = {
    todayStr: string | null;
    entries: DayEntry[];
    loadingTop: boolean;
    loadingBottom: boolean;
    isInitialSyncing: boolean;
    isResumeSyncing: boolean;
    isEditLocked: boolean;
    syncError: string | null;
    /**
     * 読み込んだ範囲のうち、既定予定を書き込んだ記録（default_schedule_applications）の無い日。空き時間の
     * 計算ではこの日を未読込として既定の起床・消灯で補う（既定予定の effective_from より前の過去の日など）。
     * 記録をまだ読んでいない日は含めない。
     */
    unappliedDays: Set<string>;
    /** 既定予定を書き込んだ記録を最後に読みに行って失敗した日がある間の警告。読み直して成功すれば消える。 */
    appliedDaysError: string | null;
    scrollContainerRef: RefObject<HTMLDivElement | null>;
    topSentinelRef: RefObject<HTMLDivElement | null>;
    bottomSentinelRef: RefObject<HTMLDivElement | null>;
    todaySectionRef: RefObject<HTMLElement | null>;
    reloadSchedules: () => Promise<void>;
    updateDayContent: (dateLabel: string, value: string) => void;
    focusDay: (dateLabel: string) => void;
    blurDay: (dateLabel: string) => void;
};

/** スケジュール一覧の取得・保存・双方向無限スクロール・ライフサイクル同期。 */
export function useSchedules(
    supabase: SupabaseClient<Database>,
    companions: UseSchedulesCompanions
): UseSchedulesReturn {
    const {
        loadNotes,
        flushPendingNoteSaves,
        hasPendingNoteChanges,
        hasPendingInboxChanges,
        saveInboxNow,
    } = companions;

    const tz = useMemo(() => getDefaultTimezone(), []);

    const [todayStr, setTodayStr] = useState<string | null>(null);
    const [rangeStart, setRangeStart] = useState<Date | null>(null);
    const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
    const [entries, setEntries] = useState<DayEntry[]>([]);
    const [focusedDateLabel, setFocusedDateLabel] = useState<string | null>(null);
    const [loadingTop, setLoadingTop] = useState(false);
    const [loadingBottom, setLoadingBottom] = useState(false);
    const [hasMorePast, setHasMorePast] = useState(true);
    const [isInitialSyncing, setIsInitialSyncing] = useState(true);
    const [isResumeSyncing, setIsResumeSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    // 戻ったときの判定（syncIfChanged）で、最新の警告の有無を読むため。
    const syncErrorRef = useRef<string | null>(null);
    useLayoutEffect(() => {
        syncErrorRef.current = syncError;
    });
    const [unappliedDays, setUnappliedDays] = useState<Set<string>>(() => new Set());
    // 記録を最後に読みに行った要求が失敗した日。syncError とは分けて持つ（編集・保存の成功や、別の読み込みの
    // 完了順で警告が消えたり戻ったりしないよう、日ごとの最新の要求の結果だけで決める）。
    const [appliedReadFailedDays, setAppliedReadFailedDays] = useState<Set<string>>(() => new Set());

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const focusedDateLabelRef = useRef<string | null>(null);
    const pendingSaveDateLabelRef = useRef<string | null>(null);
    const entriesRef = useRef<DayEntry[]>(entries);
    const isResumeSyncingRef = useRef(false);
    const dirtyDateLabelsRef = useRef(new Set<string>());
    const saveQueueRef = useRef(new ScheduleSaveQueue());
    // 画面が持っている予定とメモが DB のどの版か（読み込んだ範囲と、予定・メモの目印）。タブに戻ったときは
    // 目印だけを問い合わせ、同じなら読み直さない（2026-10-23。戻るたびに予定・版・既定予定の記録・メモを
    // 読み直していた）。目印は読む前に取る。読んだ後に取ると、その間の書き込みを読まずに目印だけ進めてしまう。
    const loadedStampRef = useRef<{ range: string; stamp: string } | null>(null);
    // 既定予定の書き込みが失敗したまま残っているか。残っていれば、戻ったときに目印によらず書き込みからやり直す。
    const defaultsFailedRef = useRef(false);
    /** 日ごとの連続保存失敗回数。保存成功・編集・再読み込みでリセットする。 */
    const saveFailureCountRef = useRef(new Map<string, number>());
    /** 自動保存を打ち切った日。ユーザーの編集か再読み込みでのみ解除する。 */
    const autoSaveSuspendedRef = useRef(new Set<string>());

    useLayoutEffect(() => {
        focusedDateLabelRef.current = focusedDateLabel;
        entriesRef.current = entries;
        isResumeSyncingRef.current = isResumeSyncing;
    });

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const scrollHeightBeforePrependRef = useRef<number>(0);
    const pendingScrollFixRef = useRef(false);
    const scrollTodayAfterInitialMergeRef = useRef(false);

    const topSentinelRef = useRef<HTMLDivElement>(null);
    const bottomSentinelRef = useRef<HTMLDivElement>(null);
    const todaySectionRef = useRef<HTMLElement | null>(null);

    // イベントハンドラ内から最新値を読むためのref。依存配列に入れると、未保存状態が
    // 切り替わるたびにeffectが張り直され、その掃除でデバウンス待ちが即時保存されてしまう。
    const hasPendingNoteChangesRef = useRef(false);
    useLayoutEffect(() => {
        hasPendingNoteChangesRef.current = hasPendingNoteChanges;
    });
    const isEditLocked = isInitialSyncing || isResumeSyncing;

    /**
     * 読み込む日へ既定予定を書き込む。取得より前に待つこと（書き込み後の revision を読むため）。
     * 失敗しても予定の表示は止めない。既定予定が入らないだけで、次の読み込みで入る。
     */
    const applyDefaults = useCallback(
        async (startDay: string, endDay: string): Promise<boolean> => {
            const { error } = await applyDefaultSchedules(supabase, startDay, endDay, tz);
            if (error) {
                console.error('既定予定の書き込みに失敗しました', error);
                defaultsFailedRef.current = true;
                return false;
            }
            return true;
        },
        [supabase, tz]
    );

    /**
     * 範囲の予定・版・メモの目印（getSchedulesStamp / getScheduleDayRevisionsStamp / getScheduleDayNotesStamp）。
     * どれかが失敗したら null。
     */
    const readStamp = useCallback(
        async (startDay: string, endDay: string): Promise<string | null> => {
            const startUtc = localTimeToUtc(startDay, '0000', tz);
            const endUtc = localTimeToUtc(format(addDays(parseISO(endDay), 1), 'yyyy-MM-dd'), '0000', tz);
            const [schedules, revisions, notes] = await Promise.all([
                getSchedulesStamp(supabase, startUtc, endUtc),
                getScheduleDayRevisionsStamp(supabase, startDay, endDay),
                getScheduleDayNotesStamp(supabase, startDay, endDay),
            ]);
            if (schedules.data == null || revisions.data == null || notes.data == null) return null;
            return `${schedules.data}#${revisions.data}#${notes.data}`;
        },
        [supabase, tz]
    );

    /** readAppliedDays の要求の通し番号と、日ごとに最後にその日を読みに行った要求の番号。 */
    const appliedReadSeqRef = useRef(0);
    const appliedReadOfDayRef = useRef(new Map<string, number>());

    /**
     * 既定予定を書き込んだ記録を読み、記録の無い日を unappliedDays に入れる。applyDefaults の後に同じ範囲で
     * 呼ぶ（先に読むと、これから書き込む日まで記録が無いと判定する）。読み込みは範囲が重なって並ぶことがある
     * （初回の読み込み中の再読み込みなど）ので、日ごとに最後に読みに行った要求の応答だけを反映し、遅れて
     * 届いた古い応答で新しい結果を戻さない。読み損ねた日は appliedReadFailedDays に入れて警告を出し（その日は
     * 前の判定のまま）、読み直して成功したら外す。
     */
    const readAppliedDays = useCallback(
        async (startDay: string, endDay: string) => {
            const seq = ++appliedReadSeqRef.current;
            const days: string[] = [];
            for (let d = parseISO(startDay); d <= parseISO(endDay); d = addDays(d, 1)) days.push(format(d, 'yyyy-MM-dd'));
            for (const day of days) appliedReadOfDayRef.current.set(day, seq);
            const { data, error } = await getDefaultAppliedDays(supabase, startDay, endDay);
            const latest = days.filter((day) => appliedReadOfDayRef.current.get(day) === seq);
            if (latest.length === 0) return;
            if (error || !data) {
                console.error('既定予定の記録の読み込みに失敗しました', error);
                setAppliedReadFailedDays((prev) => new Set([...prev, ...latest]));
                return;
            }
            setUnappliedDays((prev) => {
                const next = new Set(prev);
                for (const day of latest) {
                    if (data.has(day)) next.delete(day);
                    else next.add(day);
                }
                return next;
            });
            setAppliedReadFailedDays((prev) => {
                if (!latest.some((day) => prev.has(day))) return prev;
                const next = new Set(prev);
                for (const day of latest) next.delete(day);
                return next;
            });
        },
        [supabase]
    );

    // --- 初回（クライアントのみ）: 日付確定 → entries 生成 → DB fetch → 今日へスクロール ---
    useEffect(() => {
        const str = format(toZonedTime(new Date(), tz), 'yyyy-MM-dd');
        const today = parseISO(str);
        const start = addDays(today, -7);
        const end = addMonths(today, 2);
        setTodayStr(str);
        setRangeStart(start);
        setRangeEnd(end);
        const initial = generateDayEntries(start, end);
        setEntries(initial);

        const startUtc = localTimeToUtc(format(start, 'yyyy-MM-dd'), '0000', tz);
        const endUtc = localTimeToUtc(format(addDays(end, 1), 'yyyy-MM-dd'), '0000', tz);
        const startDay = format(start, 'yyyy-MM-dd');
        const endDay = format(end, 'yyyy-MM-dd');
        // 既定予定を書き込む → 目印を取る → 予定・版・既定予定の記録・メモを読む、の順（目印は読む前に取る）。
        void applyDefaults(startDay, endDay)
            .then((applied) => {
                if (applied) defaultsFailedRef.current = false;
                return readStamp(startDay, endDay);
            })
            .then((stamp) => Promise.all([
                getSchedules(supabase, startUtc, endUtc),
                getScheduleDayRevisions(supabase, startDay, endDay),
                readAppliedDays(startDay, endDay),
                loadNotes(startDay, endDay),
                stamp,
            ]))
            .then(([schedulesResult, revisionsResult, , notesResult, stamp]) => {
                if (schedulesResult.error || revisionsResult.error) {
                    setSyncError('スケジュールの読み込みに失敗しました。');
                    return;
                }
                if (stamp && notesResult?.applied) loadedStampRef.current = { range: `${startDay}..${endDay}`, stamp };
                const merged = mergeSchedulesIntoEntries(initial, schedulesResult.data ?? [], tz);
                setEntries(applyScheduleRevisions(merged, revisionsResult.data ?? []));
                scrollTodayAfterInitialMergeRef.current = true;
            })
            .finally(() => {
                setTodayStr(format(toZonedTime(new Date(), tz), 'yyyy-MM-dd'));
                setIsInitialSyncing(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * 読み込んだ範囲を全部読み直す（ヘッダーの再読み込みボタンと、タブに戻って目印が変わっていたとき）。
     * resumeStamp を渡されたら（戻ったときに取った目印）既定予定の書き込みを省き、その目印を記録する。範囲は
     * 戻る前と同じなので既定予定は書き込み済み。渡されなければ書き込んでから目印を取る。
     */
    const reloadSchedules = useCallback(async (resumeStamp?: string) => {
        if (!rangeStart || !rangeEnd) return;
        setLoadingTop(true);
        setLoadingBottom(true);
        const startDay = format(rangeStart, 'yyyy-MM-dd');
        const endDay = format(rangeEnd, 'yyyy-MM-dd');
        const startUtc = localTimeToUtc(startDay, '0000', tz);
        const endUtc = localTimeToUtc(format(addDays(rangeEnd, 1), 'yyyy-MM-dd'), '0000', tz);
        let stamp: string | null | undefined = resumeStamp;
        if (stamp === undefined) {
            if (await applyDefaults(startDay, endDay)) defaultsFailedRef.current = false;
            stamp = await readStamp(startDay, endDay);
        }
        const [schedulesResult, revisionsResult, , notesResult] = await Promise.all([
            getSchedules(supabase, startUtc, endUtc),
            getScheduleDayRevisions(supabase, startDay, endDay),
            readAppliedDays(startDay, endDay),
            loadNotes(startDay, endDay),
        ]);
        loadedStampRef.current =
            stamp && notesResult?.applied && !schedulesResult.error && !revisionsResult.error
                ? { range: `${startDay}..${endDay}`, stamp }
                : null;
        if (!schedulesResult.error && !revisionsResult.error) {
            setEntries((prev) => {
                const merged = applyScheduleRevisions(
                    mergeSchedulesIntoEntries(prev, schedulesResult.data ?? [], tz),
                    revisionsResult.data ?? []
                );
                return merged.map((entry, index) =>
                    dirtyDateLabelsRef.current.has(entry.dateLabel) ? prev[index] : entry
                );
            });
            // サーバの最新revisionを取り込めたので、打ち切っていた日の自動保存を再開してよい。
            autoSaveSuspendedRef.current.clear();
            saveFailureCountRef.current.clear();
            setSyncError(null);
        } else {
            setSyncError('スケジュールの同期に失敗しました。');
        }
        setTodayStr(format(toZonedTime(new Date(), tz), 'yyyy-MM-dd'));
        setLoadingTop(false);
        setLoadingBottom(false);
    }, [rangeStart, rangeEnd, tz, supabase, loadNotes, applyDefaults, readAppliedDays, readStamp]);

    /**
     * タブに戻ったとき: 目印だけを問い合わせ、読み込んだ範囲のまま変わっていなければ何も読まない。
     * ただし次のときは目印によらず、既定予定の書き込みも含めて全部読み直す（読み直しが立て直しを兼ねるため）:
     * 既定予定の書き込みが失敗したまま、自動保存を止めた日や保存の失敗が残っている、同期の警告が出ている。
     */
    const syncIfChanged = useCallback(async () => {
        if (!rangeStart || !rangeEnd) return;
        // 予定が変わっていなくても日付はまたぎうる（今日の強調と今日へのスクロールのため）。
        setTodayStr(format(toZonedTime(new Date(), tz), 'yyyy-MM-dd'));
        if (
            defaultsFailedRef.current
            || autoSaveSuspendedRef.current.size > 0
            || saveFailureCountRef.current.size > 0
            || syncErrorRef.current !== null
        ) {
            await reloadSchedules();
            return;
        }
        const startDay = format(rangeStart, 'yyyy-MM-dd');
        const endDay = format(rangeEnd, 'yyyy-MM-dd');
        const stamp = await readStamp(startDay, endDay);
        const loaded = loadedStampRef.current;
        if (stamp !== null && loaded?.range === `${startDay}..${endDay}` && loaded.stamp === stamp) return;
        // 目印が取れなかったときは、既定予定の書き込みも含めて今までどおり読み直す。
        await reloadSchedules(stamp ?? undefined);
    }, [rangeStart, rangeEnd, tz, readStamp, reloadSchedules]);

    useEffect(() => {
        if (!todayStr || entries.length === 0) return;
        todaySectionRef.current?.scrollIntoView({ block: 'start' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [todayStr]);

    useLayoutEffect(() => {
        if (!pendingScrollFixRef.current) return;
        pendingScrollFixRef.current = false;
        const container = scrollContainerRef.current;
        if (!container) return;
        const diff = container.scrollHeight - scrollHeightBeforePrependRef.current;
        if (diff > 0) container.scrollTop += diff;
    });

    useLayoutEffect(() => {
        if (!scrollTodayAfterInitialMergeRef.current || !todayStr) return;
        scrollTodayAfterInitialMergeRef.current = false;
        todaySectionRef.current?.scrollIntoView({ block: 'start' });
    }, [entries, todayStr]);

    const clearDebounceTimer = useCallback(() => {
        if (!debounceTimerRef.current) return;
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
    }, []);

    const saveDay = useCallback(
        (dateLabel: string) => {
            const dateStr = dateLabelToDateStr(dateLabel);
            if (!dateStr || !dirtyDateLabelsRef.current.has(dateLabel)) return Promise.resolve();
            if (autoSaveSuspendedRef.current.has(dateLabel)) return Promise.resolve();

            return saveQueueRef.current.enqueue(dateStr, async () => {
                if (!dirtyDateLabelsRef.current.has(dateLabel)) return;
                if (autoSaveSuspendedRef.current.has(dateLabel)) return;
                const entry = entriesRef.current.find((candidate) => candidate.dateLabel === dateLabel);
                if (!entry) return;

                const savedContent = entry.content;
                // 不正な行(終了時刻の無い予定・終了が開始より前・時刻の無い行)がある日は保存しない。
                // dirty のまま残すので、直した編集で次の保存が走る。通信しないので再試行の嵐にもならない。
                if (findDayContentIssues(savedContent).length > 0) return;
                const day_start_utc = localTimeToUtc(dateStr, '0000', tz);
                const nextDateStr = format(addDays(parseISO(dateStr), 1), 'yyyy-MM-dd');
                const day_end_utc = localTimeToUtc(nextDateStr, '0000', tz);
                const items = dayContentToScheduleItems(dateStr, savedContent, tz);
                const { data: rpcResult, error } = await replaceSchedulesForDay(
                    supabase,
                    dateStr,
                    day_start_utc,
                    day_end_utc,
                    entry.revision,
                    items
                );
                const outcome = error
                    ? ({ kind: 'failed' } as const)
                    : decodeScheduleSaveOutcome(rpcResult);

                if (outcome.kind === 'conflict') {
                    // 楽観ロックの競合は待っても解消しない。dirtyを残したまま再試行すると
                    // 同じ expected_revision のまま永久に失敗し続けるので、この日は打ち切る。
                    const serverRevision = outcome.currentRevision;
                    const synced = entriesRef.current.map((current) =>
                        current.dateLabel === dateLabel
                            ? { ...current, revision: serverRevision }
                            : current
                    );
                    entriesRef.current = synced;
                    setEntries(synced);
                    saveFailureCountRef.current.set(
                        dateLabel,
                        (saveFailureCountRef.current.get(dateLabel) ?? 0) + 1
                    );
                    dirtyDateLabelsRef.current.delete(dateLabel);
                    autoSaveSuspendedRef.current.add(dateLabel);
                    setSyncError(
                        `${dateStr} は別のデバイスで更新されています。再読み込みしてください。`
                    );
                    return;
                }

                if (outcome.kind === 'failed') {
                    const failures = (saveFailureCountRef.current.get(dateLabel) ?? 0) + 1;
                    saveFailureCountRef.current.set(dateLabel, failures);

                    if (failures >= MAX_CONSECUTIVE_SAVE_FAILURES) {
                        dirtyDateLabelsRef.current.delete(dateLabel);
                        autoSaveSuspendedRef.current.add(dateLabel);
                        setSyncError(
                            `${dateStr} の保存に${MAX_CONSECUTIVE_SAVE_FAILURES}回続けて失敗したため自動保存を止めました。再読み込みしてください。`
                        );
                        return;
                    }

                    setSyncError(`${dateStr} の保存に失敗しました。`);
                    return;
                }

                saveFailureCountRef.current.delete(dateLabel);

                const nextEntries = entriesRef.current.map((current) => {
                    if (current.dateLabel !== dateLabel) return current;
                    if (current.content === savedContent) {
                        dirtyDateLabelsRef.current.delete(dateLabel);
                    }
                    return { ...current, revision: outcome.revision };
                });
                entriesRef.current = nextEntries;
                setEntries(nextEntries);
                setSyncError(null);
            });
        },
        [supabase, tz]
    );

    const flushPendingScheduleSave = useCallback(() => {
        if (debounceTimerRef.current == null) return;
        clearDebounceTimer();
        const dateLabel = pendingSaveDateLabelRef.current ?? focusedDateLabelRef.current;
        pendingSaveDateLabelRef.current = null;
        if (!dateLabel) return;
        void saveDay(dateLabel);
    }, [clearDebounceTimer, saveDay]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            const hadScheduleDebounce = debounceTimerRef.current != null;
            flushPendingScheduleSave();
            flushPendingNoteSaves();
            if (hasPendingInboxChanges) saveInboxNow();
            // 不正な行があって保存していない編集は、閉じると消えるので引き止める。
            const hasUnsavedInvalidDay = entriesRef.current.some(
                (entry) =>
                    dirtyDateLabelsRef.current.has(entry.dateLabel) &&
                    findDayContentIssues(entry.content).length > 0
            );
            if (
                !hadScheduleDebounce &&
                !hasPendingInboxChanges &&
                !hasPendingNoteChangesRef.current &&
                !hasUnsavedInvalidDay
            ) {
                return;
            }
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            flushPendingScheduleSave();
            if (hasPendingInboxChanges) saveInboxNow();
        };
        // メモのアンマウント時保存は useDayNotes 側が行うため、ここでは flush しない。
    }, [flushPendingScheduleSave, flushPendingNoteSaves, hasPendingInboxChanges, saveInboxNow]);

    const updateDayContent = useCallback(
        (dateLabel: string, value: string) => {
            if (isEditLocked) return;
            dirtyDateLabelsRef.current.add(dateLabel);
            // 人が編集し直したときだけ、打ち切った自動保存を再開する。
            autoSaveSuspendedRef.current.delete(dateLabel);
            saveFailureCountRef.current.delete(dateLabel);
            setSyncError(null);
            setEntries((prev) => {
                const next = [...prev];
                const idx = next.findIndex((e) => e.dateLabel === dateLabel);
                if (idx === -1) return prev;
                next[idx] = { ...next[idx], content: value };
                entriesRef.current = next;
                return next;
            });
            if (focusedDateLabel !== dateLabel) return;
            clearDebounceTimer();
            pendingSaveDateLabelRef.current = dateLabel;
            debounceTimerRef.current = setTimeout(() => {
                debounceTimerRef.current = null;
                pendingSaveDateLabelRef.current = null;
                void saveDay(dateLabel);
            }, 500);
        },
        [isEditLocked, focusedDateLabel, clearDebounceTimer, saveDay]
    );

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flushPendingScheduleSave();
                flushPendingNoteSaves();
                if (hasPendingInboxChanges) saveInboxNow();
                setFocusedDateLabel(null);
                pendingSaveDateLabelRef.current = null;
            } else if (document.visibilityState === 'visible') {
                if (
                    pendingSaveDateLabelRef.current != null
                    || focusedDateLabelRef.current != null
                    || hasPendingInboxChanges
                    || hasPendingNoteChangesRef.current
                ) {
                    return;
                }
                if (isResumeSyncingRef.current) return;
                isResumeSyncingRef.current = true;
                setIsResumeSyncing(true);
                void saveQueueRef.current.waitForIdle().then(syncIfChanged).finally(() => {
                    isResumeSyncingRef.current = false;
                    setIsResumeSyncing(false);
                });
            }
        };
        const handlePageHide = () => {
            flushPendingScheduleSave();
            flushPendingNoteSaves();
            if (hasPendingInboxChanges) saveInboxNow();
        };
        const handleFreeze = () => {
            flushPendingScheduleSave();
            flushPendingNoteSaves();
            if (hasPendingInboxChanges) saveInboxNow();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('freeze', handleFreeze);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('freeze', handleFreeze);
            flushPendingScheduleSave();
            if (hasPendingInboxChanges) saveInboxNow();
        };
    }, [
        flushPendingScheduleSave,
        flushPendingNoteSaves,
        hasPendingInboxChanges,
        saveInboxNow,
        syncIfChanged,
    ]);

    const loadMoreFuture = useCallback(async () => {
        if (loadingBottom || !rangeEnd) return;
        setLoadingBottom(true);
        const newEnd = addMonths(rangeEnd, 1);
        const newEntries = generateDayEntries(addDays(rangeEnd, 1), newEnd);
        void loadNotes(
            format(addDays(rangeEnd, 1), 'yyyy-MM-dd'),
            format(newEnd, 'yyyy-MM-dd')
        );
        const startUtc = localTimeToUtc(
            format(addDays(rangeEnd, 1), 'yyyy-MM-dd'),
            '0000',
            tz
        );
        const endUtc = localTimeToUtc(format(addDays(newEnd, 1), 'yyyy-MM-dd'), '0000', tz);
        await applyDefaults(format(addDays(rangeEnd, 1), 'yyyy-MM-dd'), format(newEnd, 'yyyy-MM-dd'));
        const [schedulesResult, revisionsResult] = await Promise.all([
            getSchedules(supabase, startUtc, endUtc),
            getScheduleDayRevisions(
                supabase,
                format(addDays(rangeEnd, 1), 'yyyy-MM-dd'),
                format(newEnd, 'yyyy-MM-dd')
            ),
            readAppliedDays(format(addDays(rangeEnd, 1), 'yyyy-MM-dd'), format(newEnd, 'yyyy-MM-dd')),
        ]);
        const merged = applyScheduleRevisions(
            mergeSchedulesIntoEntries(newEntries, schedulesResult.data ?? [], tz),
            revisionsResult.data ?? []
        );
        setEntries((prev) => [...prev, ...merged]);
        setRangeEnd(newEnd);
        setLoadingBottom(false);
    }, [loadingBottom, rangeEnd, supabase, tz, loadNotes, applyDefaults, readAppliedDays]);

    const loadMorePast = useCallback(async () => {
        if (loadingTop || !hasMorePast || !rangeStart) return;
        setLoadingTop(true);
        const newStart = subMonths(rangeStart, 1);
        const newEntries = generateDayEntries(newStart, addDays(rangeStart, -1));
        const startUtc = localTimeToUtc(format(newStart, 'yyyy-MM-dd'), '0000', tz);
        const endUtc = localTimeToUtc(format(rangeStart, 'yyyy-MM-dd'), '0000', tz);
        await applyDefaults(format(newStart, 'yyyy-MM-dd'), format(addDays(rangeStart, -1), 'yyyy-MM-dd'));
        const [notesResult, [schedulesResult, revisionsResult]] = await Promise.all([
            loadNotes(
                format(newStart, 'yyyy-MM-dd'),
                format(addDays(rangeStart, -1), 'yyyy-MM-dd')
            ),
            Promise.all([
                getSchedules(supabase, startUtc, endUtc),
                getScheduleDayRevisions(
                    supabase,
                    format(newStart, 'yyyy-MM-dd'),
                    format(addDays(rangeStart, -1), 'yyyy-MM-dd')
                ),
                readAppliedDays(format(newStart, 'yyyy-MM-dd'), format(addDays(rangeStart, -1), 'yyyy-MM-dd')),
            ]),
        ]);
        const scheduleRows = schedulesResult.data ?? [];
        if (scheduleRows.length === 0 && (notesResult?.count ?? 0) === 0) {
            setHasMorePast(false);
            setLoadingTop(false);
            return;
        }
        const merged = applyScheduleRevisions(
            mergeSchedulesIntoEntries(newEntries, scheduleRows, tz),
            revisionsResult.data ?? []
        );
        if (scrollContainerRef.current) {
            scrollHeightBeforePrependRef.current = scrollContainerRef.current.scrollHeight;
            pendingScrollFixRef.current = true;
        }
        setEntries((prev) => [...merged, ...prev]);
        setRangeStart(newStart);
        setLoadingTop(false);
    }, [loadingTop, hasMorePast, rangeStart, supabase, tz, loadNotes, applyDefaults, readAppliedDays]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        const topSentinel = topSentinelRef.current;
        const bottomSentinel = bottomSentinelRef.current;
        if (!container || !topSentinel || !bottomSentinel) return;

        const obs = new IntersectionObserver(
            (observed) => {
                for (const entry of observed) {
                    if (!entry.isIntersecting) continue;
                    if (entry.target === bottomSentinel) {
                        void loadMoreFuture();
                    } else if (entry.target === topSentinel && hasMorePast) {
                        void loadMorePast();
                    }
                }
            },
            {
                root: container,
                rootMargin: '400px',
                threshold: 0,
            }
        );

        obs.observe(topSentinel);
        obs.observe(bottomSentinel);
        return () => obs.disconnect();
    }, [loadMoreFuture, loadMorePast, hasMorePast]);

    const focusDay = useCallback(
        (dateLabel: string) => {
            if (isEditLocked) return;
            setFocusedDateLabel(dateLabel);
        },
        [isEditLocked]
    );

    const blurDay = useCallback(
        (dateLabel: string) => {
            setFocusedDateLabel(null);
            if (isEditLocked) return;
            clearDebounceTimer();
            pendingSaveDateLabelRef.current = null;
            void saveDay(dateLabel);
        },
        [isEditLocked, clearDebounceTimer, saveDay]
    );

    // 表示している範囲の日だけを数える（過去へ読みに行ってそれ以上の日が無かったときは範囲を広げないので、
    // その日の読み損ねは再読み込みでも読み直されず、警告が消えなくなる）。
    const appliedDaysError = useMemo(() => {
        if (!rangeStart || !rangeEnd) return null;
        const from = format(rangeStart, 'yyyy-MM-dd');
        const to = format(rangeEnd, 'yyyy-MM-dd');
        return [...appliedReadFailedDays].some((day) => day >= from && day <= to) ? APPLIED_DAYS_ERROR : null;
    }, [appliedReadFailedDays, rangeStart, rangeEnd]);

    return {
        todayStr,
        entries,
        loadingTop,
        loadingBottom,
        isInitialSyncing,
        isResumeSyncing,
        isEditLocked,
        syncError,
        unappliedDays,
        appliedDaysError,
        scrollContainerRef,
        topSentinelRef,
        bottomSentinelRef,
        todaySectionRef,
        reloadSchedules,
        updateDayContent,
        focusDay,
        blurDay,
    };
}
