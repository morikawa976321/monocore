/**
 * Tasks(Schedules のモーダル)のカードの本文の各行の頭に描く箇条書きの点。
 * 点は入力欄の横に描くだけで本文の文字には入れない(components/tasks/BlockedProjectCards.tsx)。保存する
 * blocked_projects.tasks も点の無い1行1タスクのまま(monocore スキルの blocked append / done も点の無い行を読み書きする)。
 */
export const BULLET = '・';
const BULLET_RUN = new RegExp(`^${BULLET}+`);

/**
 * 入力欄の文字列を保存する形に。中身の無い行を落とす。点は描いて出すので、手で打たれた行頭の点
 * (続けて打たれたものもまとめて)は外す。
 */
export function fromBulletedText(text: string): string {
    return text
        .split(/\r?\n/)
        .map((l) => l.replace(BULLET_RUN, ''))
        .filter((l) => l.trim() !== '')
        .join('\n');
}
