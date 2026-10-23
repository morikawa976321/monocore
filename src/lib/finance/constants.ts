export const MIN_HORIZON = '2042-03';
export const MILESTONES = [
    { month: '2028-03', label: '卒業' },
    { month: '2042-03', label: '返済完了' },
] as const;
export const ASSUMPTIONS = [
    'NISA は市場変動 0(拠出分だけ増える)',
    '2028-04 以降は就職後の収入・生活費が未定義で、登録済みの項目だけで計算した値',
] as const;
