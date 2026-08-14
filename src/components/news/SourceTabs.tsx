'use client'

import { Button } from '@/src/components/ui/Button'
import type { SourceTab } from '@/src/lib/news/group'

export function SourceTabs({
    tabs,
    activeKey,
    onSelect,
}: {
    tabs: SourceTab[]
    activeKey: string
    onSelect: (key: string) => void
}) {
    return (
        // role="tab" は使わない。tab は tabpanel と aria-controls で対になっている
        // ことを支援技術が前提にするが、ここは一覧を絞り込むトグルでしかないため、
        // group + aria-pressed で「押されている絞り込み」として素直に表す。
        <div
            role="group"
            aria-label="ソースで絞り込む"
            className="flex gap-2 overflow-x-auto pb-1"
        >
            {tabs.map((tab) => {
                const isActive = tab.key === activeKey
                return (
                    <Button
                        key={tab.key}
                        aria-pressed={isActive}
                        color={isActive ? 'primary' : 'secondary'}
                        onClick={() => onSelect(tab.key)}
                        className="shrink-0 px-2 py-1"
                    >
                        {tab.label} ({tab.count})
                    </Button>
                )
            })}
        </div>
    )
}
