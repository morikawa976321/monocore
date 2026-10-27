'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';

interface PageHeaderProps {
    title: string;
    onRefresh?: () => void | Promise<void>;
    isRefreshing?: boolean;
    children?: React.ReactNode;
    /** タイトルの右に置く要素(Schedules のタイマー)。 */
    titleAccessory?: React.ReactNode;
    /** 下線に重ねる要素(Schedules のタイマーの残りのバー)。absolute で置く。 */
    underline?: React.ReactNode;
}

export function PageHeader({ title, onRefresh, isRefreshing = false, children, titleAccessory, underline }: PageHeaderProps) {
    return (
        <header className="relative flex items-center justify-between px-2 sm:px-6 py-2 sm:py-2 border-b border-neutral-300 dark:border-neutral-700 bg-neutral-200 dark:bg-neutral-800 shrink-0">
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                <h1 className="shrink-0 text-base sm:text-lg font-medium leading-6 sm:leading-7 tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
                    {title}
                </h1>
                {titleAccessory}
            </div>
            <div className="flex h-9 items-center justify-end gap-2">
                {onRefresh && (
                    <Button
                        color="secondary"
                        onClick={() => void onRefresh()}
                        aria-label="再読み込み"
                        aria-busy={isRefreshing}
                        title={isRefreshing ? '更新中' : '最新の状態に更新'}
                        className={`h-9 px-2 transition-opacity duration-150 ease-in-out ${isRefreshing ? 'opacity-50' : ''}`}
                    >
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                )}
                {children}
            </div>
            {underline}
        </header>
    );
}
