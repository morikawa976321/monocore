'use client';

import { useMemo } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { useFinance } from '@/src/hooks/useFinance';
import { PageHeader } from '@/src/components/layout/PageHeader';
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator';
import { FinanceChart } from '@/src/components/finance/FinanceChart';
import { AssetsTable } from '@/src/components/finance/AssetsTable';
import { PlanTable } from '@/src/components/finance/PlanTable';
import { CARD, CARD_BODY, NOTICE } from '@/src/components/finance/card';
import { displayedRows } from '@/src/lib/finance/projection';

/** 家計の見通し。外枠・ヘッダー・スクロール域・同期中の覆いは Ahead(/plan)と同じ構成。 */
export default function FinancePage() {
    const client = useMemo(() => createClient(), []);
    const finance = useFinance(client);

    return (
        <div className="flex flex-col h-screen bg-neutral-100 dark:bg-neutral-950">
            <PageHeader title="Finance" onRefresh={() => void finance.refresh()} isRefreshing={finance.saving}>
                {finance.isLoading && (
                    <div className="inline-flex items-center gap-2">
                        <LoadingIndicator />
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">同期中…</span>
                    </div>
                )}
                {finance.loadError && <span className={NOTICE}>{finance.loadError}</span>}
            </PageHeader>

            <div className="flex-1 overflow-hidden relative">
                <div className="h-full overflow-y-auto px-2 sm:px-6 py-1 sm:py-4 space-y-2 sm:space-y-4">
                    {!finance.isLoading && !finance.loadError && (
                        <>
                            {/* 折れ線だけ。要約の文章は表と重複するので置かない(2026-10-23 本人の指示) */}
                            {finance.base && (
                                <section className={CARD} aria-label="見通しの折れ線">
                                    <div className={CARD_BODY}>
                                        <FinanceChart measurements={finance.measurements} future={displayedRows(finance.simulation.rows)} />
                                    </div>
                                </section>
                            )}
                            {/* 広い画面は資産と計画を同じ幅で横に並べる。どちらもデータ4列+操作列なので、余裕があるときは両方の表の列が
                                同じ幅に揃う(本人の指示 2026-10-23)。min-w-0 を付けないので、中身が半分に収まらない側は中身の幅が勝つ。
                                資産は約190行、計画は十数行なので、計画は sticky にして資産をスクロールしても見え続けるようにする(本人の指示 2026-10-23) */}
                            <div className="flex flex-col lg:flex-row lg:items-start gap-2 sm:gap-4">
                                <div className="lg:flex-1">
                                    <AssetsTable finance={finance} />
                                </div>
                                <div className="lg:flex-1 lg:sticky lg:top-0">
                                    <PlanTable finance={finance} />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {finance.isLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-100/80 dark:bg-neutral-950/80">
                        <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 rounded p-4">
                            <LoadingIndicator />
                            <span className="text-sm text-neutral-700 dark:text-neutral-300">同期中…</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
