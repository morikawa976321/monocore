/**
 * Tasks(Schedules のモーダル)に出すカードの枠。1段目が固定枠、2段目が自由枠で、タイトルは固定(本人決定 2026-10-23。
 * 枠そのものは context-engine の決定で、変わったらここを直す。docs/decisions.md「本人待ちの表示」)。
 * カードは blocked_projects.name の完全一致で選ぶ。ここに無い名前の行は画面に出さない(DB には残る)。
 */
export const SLOT_ROWS = [
    ['就活', '研究'],
    ['funomi', 'モデリング・3DP受注'],
] as const;
