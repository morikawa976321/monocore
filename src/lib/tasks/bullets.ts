/**
 * Tasks(/plan)のカードの本文に付ける箇条書きの点。
 * 保存する blocked_projects.tasks は点の無い1行1タスクのまま(monocore スキルの blocked append / done も
 * 点の無い行を読み書きする)にし、点は入力欄に出すときに付け、保存するときに外す。
 */
export const BULLET = '・';
const BULLET_RUN = new RegExp(`^${BULLET}+`);

/** 保存されたタスクを入力欄の文字列に。空なら空のまま(placeholder を出すため)。 */
export function toBulletedText(tasks: string): string {
    const lines = tasks.split(/\r?\n/).filter((l) => l.trim() !== '');
    return lines.map((l) => BULLET + l).join('\n');
}

/**
 * 入力欄の文字列を保存する形に。行頭の点を外し、中身の無い行(点だけの行を含む)を落とす。
 * 点の前で Enter を押すと「・・タスク」になるので、行頭に続く点はまとめて外す。
 */
export function fromBulletedText(text: string): string {
    return text
        .split(/\r?\n/)
        .map((l) => l.replace(BULLET_RUN, ''))
        .filter((l) => l.trim() !== '')
        .join('\n');
}
