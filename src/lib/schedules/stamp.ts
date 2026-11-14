/**
 * 復帰同期の目印(useSchedules の readStamp)の合成。
 *
 * 目印は `予定#版#メモ` の3つをつないだ文字列で、予定とメモは `行数|いちばん新しい updated_at`、版は
 * `日:版,日:版,…`(日の昇順)。どれも隣り合う範囲の目印から範囲全体の目印を作れる(行数は足し、updated_at は
 * 新しい方、版は日の順につなぐ)。無限スクロールで範囲を広げたとき、広げた分だけの目印を取って合成すれば、
 * 範囲全体の目印を取り直さずに「いま手元にある内容の目印」を保てる。合成したものが次の復帰で取った目印と
 * 食い違えば(旧範囲が離れている間に書き換わっていたなど)、今までどおり読み直す。
 */

type Parts = { schedules: string; revisions: string; notes: string };

function split(stamp: string): Parts | null {
    const parts = stamp.split('#');
    if (parts.length !== 3) return null;
    return { schedules: parts[0], revisions: parts[1], notes: parts[2] };
}

/** `行数|updated_at` の2つを合成する。updated_at が空なら行が無い。 */
function combineCountAndLatest(a: string, b: string): string | null {
    const [countA, latestA, ...restA] = a.split('|');
    const [countB, latestB, ...restB] = b.split('|');
    if (latestA === undefined || latestB === undefined || restA.length > 0 || restB.length > 0) return null;
    const count = Number(countA) + Number(countB);
    if (!Number.isInteger(count) || count < 0) return null;
    let latest = latestA;
    if (latestA === '') latest = latestB;
    else if (latestB !== '') {
        const timeA = Date.parse(latestA);
        const timeB = Date.parse(latestB);
        if (Number.isNaN(timeA) || Number.isNaN(timeB)) return null;
        // マイクロ秒は Date.parse で落ちるので、同じミリ秒のときは文字列で決める(同じ書式なので辞書順で足りる)。
        if (timeB > timeA || (timeB === timeA && latestB > latestA)) latest = latestB;
    }
    return `${count}|${latest}`;
}

/**
 * 日付の昇順で隣り合う2つの範囲の目印(earlier は前の範囲、later は後の範囲)を、ひと続きの範囲の目印にする。
 * 形が合わなければ null(呼び出し側は目印を記録せず、次の復帰で読み直す)。
 */
export function combineStamps(earlier: string, later: string): string | null {
    const a = split(earlier);
    const b = split(later);
    if (!a || !b) return null;
    const schedules = combineCountAndLatest(a.schedules, b.schedules);
    const notes = combineCountAndLatest(a.notes, b.notes);
    if (schedules === null || notes === null) return null;
    const revisions = [a.revisions, b.revisions].filter((part) => part !== '').join(',');
    return `${schedules}#${revisions}#${notes}`;
}
