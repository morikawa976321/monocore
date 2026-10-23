'use client';

import { useMemo } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { useFinance } from '@/src/hooks/useFinance';
import { PageHeader } from '@/src/components/layout/PageHeader';
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator';
import { FinanceHeader } from '@/src/components/finance/FinanceHeader';
import { AssetsTable } from '@/src/components/finance/AssetsTable';
import { PlanTable } from '@/src/components/finance/PlanTable';
import { NOTICE } from '@/src/components/finance/card';

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
                            <FinanceHeader finance={finance} />
                            <AssetsTable finance={finance} />
                            <PlanTable finance={finance} />
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
