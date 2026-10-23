export const MIN_HORIZON = '2042-03';
export const MILESTONES = [
    { month: '2028-03', label: '卒業' },
    { month: '2042-03', label: '返済完了' },
] as const;
export const ASSUMPTIONS = [
    'NISA は市場変動 0(拠出分だけ増える)',
    '2028-04 以降は就職後の収入・生活費が未定義で、登録済みの項目だけで計算した値',
] as const;
/** 表と折れ線に出す予測の範囲: 当月から何ヶ月先まで(本人の指示 2026-10-23)。計算(マイルストーン・Cash が負になる月)は horizon まで続ける。 */
export const DISPLAY_MONTHS = 60;
