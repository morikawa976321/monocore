import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/src/types/database.types';
import {
    getScheduleDayNotes,
    upsertScheduleDayNote,
} from '@/src/lib/supabase/queries/schedule-day-notes';
import { mergeNoteRows } from '@/src/lib/schedules/day-notes';
import { ScheduleSaveQueue } from '@/src/lib/schedules/sync';

export type NotesLoadResult = { count: number; applied: boolean };

type UseDayNotesReturn = {
    notes: Map<string, string>;
    /**
     * 取得した行数（呼び出し側が「その範囲に何もない」ことを判定できるようにする）と、画面に反映したか（より新しい
     * 取得に追い越されたら反映しない）を返す。読み込みに失敗したら null。
     */
    loadNotes: (startDay: string, endDay: string) => Promise<NotesLoadResult | null>;
    updateNote: (dayKey: string, value: string) => void;
    flushPendingNoteSaves: () => void;
    hasPendingNoteChanges: boolean;
    noteError: string | null;
};

/** 日付ごとの自由記述メモを保持し、デバウンス保存と範囲取得を行う。 */
export function useDayNotes(supabase: SupabaseClient<Database>): UseDayNotesReturn {
    const [notes, setNotes] = useState<Map<string, string>>(new Map());
    const [hasPendingNoteChanges, setHasPendingNoteChanges] = useState(false);
    const [noteError, setNoteError] = useState<string | null>(null);
    // 非同期処理から最新の本文を読むためのバッファ。
    const notesRef = useRef<Map<string, string>>(new Map());
    // 未保存の編集がある日。保存が成功したときだけ取り除く（失敗時は残して再試行対象にする）。
    const dirtyKeysRef = useRef<Set<string>>(new Set());
    // 日付ごとのデバウンスタイマー。
    const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    // 一度でも保存に成功した日。取得中に保存が完了した日を判別するために使う。
    const savedKeysRef = useRef<Set<string>>(new Set());
    // 取得の世代。遅れて返ってきた古い取得結果を捨てる。
    const loadSeqRef = useRef(0);
    const saveQueueRef = useRef(new ScheduleSaveQueue());

    const persistNote = useCallback(
        (dayKey: string) => {
            return saveQueueRef.current.enqueue(dayKey, async () => {
                const savedBody = notesRef.current.get(dayKey) ?? '';
                const { error } = await upsertScheduleDayNote(supabase, dayKey, savedBody);

                if (error) {
                    // dirty のまま残し、次の flush か次の編集で再試行できるようにする。
                    setNoteError('メモの保存に失敗しました。');
                    setHasPendingNoteChanges(dirtyKeysRef.current.size > 0);
                    return;
                }

                savedKeysRef.current.add(dayKey);
                // 保存中にさらに編集されていた場合は dirty を残す。
                if ((notesRef.current.get(dayKey) ?? '') === savedBody) {
                    dirtyKeysRef.current.delete(dayKey);
                }
                // 他の日の保存失敗を、別の日の成功で覆い隠さない。
                if (dirtyKeysRef.current.size === 0) setNoteError(null);
                setHasPendingNoteChanges(dirtyKeysRef.current.size > 0);
            });
        },
        [supabase]
    );

    const loadNotes = useCallback(
        async (startDay: string, endDay: string): Promise<NotesLoadResult | null> => {
            const seq = ++loadSeqRef.current;
            // 取得中に保存が完了した日を後で見分けるため、開始時点の記録を控えておく。
            const savedBeforeLoad = new Set(savedKeysRef.current);
            const { data, error } = await getScheduleDayNotes(supabase, startDay, endDay);
            if (error) {
                setNoteError('メモの読み込みに失敗しました。');
                return null;
            }
            const rows = data ?? [];
            // より新しい取得が既に反映されているなら、この結果は捨てる。
            if (seq !== loadSeqRef.current) return { count: rows.length, applied: false };

            // 未保存の日に加え、この取得の最中に保存が終わった日も上書きしない
            // （取得結果のほうが保存前の古い内容を持っているため）。
            const protectedKeys = new Set(dirtyKeysRef.current);
            for (const dayKey of savedKeysRef.current) {
                if (!savedBeforeLoad.has(dayKey)) protectedKeys.add(dayKey);
            }

            const merged = mergeNoteRows(notesRef.current, rows, protectedKeys);
            notesRef.current = merged;
            setNotes(merged);
            if (dirtyKeysRef.current.size === 0) setNoteError(null);
            return { count: rows.length, applied: true };
        },
        [supabase]
    );

    const updateNote = useCallback(
        (dayKey: string, value: string) => {
            const next = new Map(notesRef.current);
            next.set(dayKey, value);
            notesRef.current = next;
            setNotes(next);
            dirtyKeysRef.current.add(dayKey);
            setHasPendingNoteChanges(true);

            const currentTimer = debounceTimersRef.current.get(dayKey);
            if (currentTimer) clearTimeout(currentTimer);

            const timer = setTimeout(() => {
                debounceTimersRef.current.delete(dayKey);
                void persistNote(dayKey);
            }, 500);
            debounceTimersRef.current.set(dayKey, timer);
        },
        [persistNote]
    );

    const flushPendingNoteSaves = useCallback(() => {
        // デバウンス待ちの日に加え、保存に失敗して dirty のまま残っている日も対象にする。
        const targets = new Set<string>([
            ...debounceTimersRef.current.keys(),
            ...dirtyKeysRef.current,
        ]);
        for (const timer of debounceTimersRef.current.values()) {
            clearTimeout(timer);
        }
        debounceTimersRef.current.clear();
        for (const dayKey of targets) {
            void persistNote(dayKey);
        }
    }, [persistNote]);

    // アンマウント時の掃除で最新の flush を呼べるようにする。
    const flushRef = useRef(flushPendingNoteSaves);
    useEffect(() => {
        flushRef.current = flushPendingNoteSaves;
    }, [flushPendingNoteSaves]);

    useEffect(() => {
        // アンマウント（SPA遷移）ではデバウンス待ちを捨てずに保存する。
        // タイマーを消すだけにすると、入力から500ms以内の遷移で内容が失われる。
        // 保存を呼び出し側コンポーネントの cleanup に任せてもだめで、React はアンマウント時の
        // cleanup をフック定義順（このフック → 呼び出し側）に走らせるため、先にここでタイマーが
        // 消え、後から走る呼び出し側は「保留中のタイマーが無い」と判断して何も保存しない。
        // ライフサイクル保存の責務はこのフックに集約し、useSchedules 側では flush しない。
        return () => {
            flushRef.current();
        };
    }, []);

    return {
        notes,
        loadNotes,
        updateNote,
        flushPendingNoteSaves,
        hasPendingNoteChanges,
        noteError,
    };
}
