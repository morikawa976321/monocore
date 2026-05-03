'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';

interface PageHeaderProps {
    title: string;
    onRefresh?: () => void | Promise<void>;
    children?: React.ReactNode;
}

export function PageHeader({ title, onRefresh, children }: PageHeaderProps) {
    return (
        <header className="flex items-center justify-between px-2 sm:px-6 py-2 sm:py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 shrink-0">
            <h1 className="text-base sm:text-lg font-medium leading-6 sm:leading-7 tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
                {title}
            </h1>
            <div className="flex h-9 items-center justify-end gap-2">
                {onRefresh && (
                    <Button
                        color="secondary"
                        onClick={() => void onRefresh()}
                        aria-label="再読み込み"
                        title="最新の状態に更新"
                        className="h-9 px-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                )}
                {children}
            </div>
        </header>
    );
}
