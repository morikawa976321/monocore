/**
 * 囲みの外枠と見出しの帯は、予定の板の日付セクション(DaySection)と Ahead のカード(plan/page.tsx の
 * CARD / CARD_HEADER / CARD_BODY)に揃える。文字列は plan/page.tsx と同じものを置く(そちらは export していない)。
 */
export const CARD = 'rounded overflow-hidden border border-neutral-400 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900';
export const CARD_HEADER =
    'px-2 sm:px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 text-sm leading-6 font-normal text-neutral-700 dark:text-neutral-300';
export const CARD_BODY = 'px-2 sm:px-4 py-2';
/** 補助テキスト(日付・メタ・凡例)。既存ページと同じ。 */
export const MUTED = 'text-neutral-700 dark:text-neutral-300';
/** エラー・注意。既存ページの PageHeader 内のエラーと同じ。 */
export const NOTICE = 'text-sm text-amber-600 dark:text-amber-400';
/** 表のセル。report-body の表(globals.css)と同じ詰め方で、罫線は内部の区切り線トークン。 */
export const TH = 'px-2 py-1 text-left font-normal whitespace-nowrap border-b border-neutral-200 dark:border-neutral-800';
export const TD = 'px-2 py-1 whitespace-nowrap';
export const NUM = 'text-right tabular-nums';
