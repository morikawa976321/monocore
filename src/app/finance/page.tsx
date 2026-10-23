'use client';

import { useMemo } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { useFinance } from '@/src/hooks/useFinance';
import { FinanceHeader } from '@/src/components/finance/FinanceHeader';
import { AssetsTable } from '@/src/components/finance/AssetsTable';
import { PlanTable } from '@/src/components/finance/PlanTable';
import { Button } from '@/src/components/ui/Button';
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator';
import { ASSUMPTIONS } from '@/src/lib/finance/constants';

export default function FinancePage() {
    const client = useMemo(() => createClient(), []);
    const finance = useFinance(client);
    return <div className="flex flex-col h-screen">
        <div className="flex-1 overflow-y-auto px-2 sm:px-6 py-4 space-y-6">
            {finance.isLoading ? <div className="flex items-center gap-2"><LoadingIndicator /><span>同期中…</span></div>
                : finance.loadError ? <div role="alert" className="space-y-2"><p className="text-amber-600 dark:text-amber-400">{finance.loadError}</p><Button onClick={() => void finance.reload()}>再読み込み</Button></div>
                : <>
                    <FinanceHeader finance={finance} />
                    {finance.simulation.error && !finance.eventDraft && <p role="alert" className="text-amber-600 dark:text-amber-400">{finance.simulation.error}</p>}
                    <AssetsTable finance={finance} />
                    <PlanTable finance={finance} />
                    <footer className="text-sm text-neutral-700 dark:text-neutral-300 border-t border-neutral-200 dark:border-neutral-800 pt-4">前提: {ASSUMPTIONS.join(' · ')}</footer>
                </>}
        </div>
    </div>;
}
