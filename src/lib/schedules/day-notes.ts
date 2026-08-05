export type ScheduleDayNote = {
    day_key: string;
    body: string;
};

/**
 * サーバーから取得したメモ行を、画面が保持しているメモ Map にマージする。
 * dirtyKeys（未保存の編集がある日）はサーバー値で上書きしない。
 */
export function mergeNoteRows(
    current: ReadonlyMap<string, string>,
    rows: ScheduleDayNote[],
    dirtyKeys: ReadonlySet<string>
): Map<string, string> {
    const merged = new Map(current);
    for (const row of rows) {
        if (dirtyKeys.has(row.day_key)) continue;
        merged.set(row.day_key, row.body);
    }
    return merged;
}
