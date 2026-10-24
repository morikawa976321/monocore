/**
 * 囲みの外枠と見出しの帯は、予定の板の日付セクション(DaySection)に揃える。Schedules の Tasks モーダル
 * (components/tasks/TasksPanel.tsx)のカードもここの CARD / CARD_HEADER / CARD_BODY を使う。
 */
export const CARD = 'rounded overflow-hidden border border-neutral-400 bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-800';
export const CARD_HEADER =
    'px-2 sm:px-4 py-2 border-b border-neutral-300 dark:border-neutral-700 bg-neutral-200 dark:bg-neutral-700/30 text-sm leading-6 font-normal text-neutral-700 dark:text-neutral-300';
export const CARD_BODY = 'px-2 sm:px-4 py-2';
/** 補助テキスト(日付・メタ・凡例)。既存ページと同じ。 */
export const MUTED = 'text-neutral-700 dark:text-neutral-300';
/** エラー・注意。既存ページの PageHeader 内のエラーと同じ。 */
export const NOTICE = 'text-sm text-amber-600 dark:text-amber-400';
/** 表のセル。report-body の表(globals.css)と同じ詰め方で、罫線は内部の区切り線トークン。 */
export const TH = 'px-2 py-1 text-left font-normal whitespace-nowrap border-b border-neutral-300 dark:border-neutral-700';
export const TD = 'px-2 py-1 whitespace-nowrap';
export const NUM = 'text-right tabular-nums';
/** 表の数値列などの左の間隔。狭い画面では TD の px-2 のまま。 */
export const GAP = 'sm:pl-6';
/**
 * 表の各データ列の見出しに付ける(4列で 1/4 ずつ)。余裕があるときは全列を均等に伸ばし(本人の指示 2026-10-23)、
 * 足りないときは中身の幅が勝つ。操作列は w-8 のまま伸ばさない。
 * 狭い画面では付けない(余裕が無いうえ、% 指定が表の最小幅を押し上げて資産の表が横にはみ出す)。
 */
export const EVEN = 'sm:w-1/4';
