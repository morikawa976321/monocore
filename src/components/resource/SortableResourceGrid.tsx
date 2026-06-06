'use client';

import { useMemo } from 'react';
import {
    DndContext,
    PointerSensor,
    TouchSensor,
    closestCenter,
    type DragEndEvent,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    rectSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reorderIds } from '@/src/lib/resource/reorder';

export type ResourceGridItem = {
    id: string;
    title: string;
};

type SortableResourceGridProps = {
    items: ResourceGridItem[];
    onSelect: (id: string) => void;
    onReorder: (orderedIds: string[]) => void;
    disabled?: boolean;
};

function SortableCard({
    item,
    onSelect,
    dragDisabled,
}: {
    item: ResourceGridItem;
    onSelect: (id: string) => void;
    dragDisabled: boolean;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id, disabled: dragDisabled });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <button
            ref={setNodeRef}
            type="button"
            title={item.title}
            style={style}
            onClick={() => onSelect(item.id)}
            className={[
                'min-w-0 w-full rounded border border-neutral-400 bg-neutral-50 p-1 text-left transition-colors duration-150 ease-in-out hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800 dark:focus-visible:ring-neutral-50 sm:p-2',
                isDragging
                    ? 'opacity-80 ring-1 ring-amber-500 dark:ring-amber-400'
                    : '',
                dragDisabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
            ].join(' ')}
            {...attributes}
            {...listeners}
        >
            <p className="truncate text-sm leading-6 text-neutral-900 dark:text-neutral-50 sm:text-base sm:leading-7">
                {item.title}
            </p>
        </button>
    );
}

function StaticCard({
    item,
    onSelect,
}: {
    item: ResourceGridItem;
    onSelect: (id: string) => void;
}) {
    return (
        <button
            type="button"
            title={item.title}
            onClick={() => onSelect(item.id)}
            className="min-w-0 w-full rounded border border-neutral-400 bg-neutral-50 p-1 text-left transition-colors duration-150 ease-in-out hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800 dark:focus-visible:ring-neutral-50 sm:p-2"
        >
            <p className="truncate text-sm leading-6 text-neutral-900 dark:text-neutral-50 sm:text-base sm:leading-7">
                {item.title}
            </p>
        </button>
    );
}

export function SortableResourceGrid({
    items,
    onSelect,
    onReorder,
    disabled = false,
}: SortableResourceGridProps) {
    const itemIds = useMemo(() => items.map((item) => item.id), [items]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
    );

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const orderedIds = reorderIds(itemIds, String(active.id), String(over.id));
        onReorder(orderedIds);
    }

    if (disabled) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-2">
                {items.map((item) => (
                    <StaticCard key={item.id} item={item} onSelect={onSelect} />
                ))}
            </div>
        );
    }

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={itemIds} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-2">
                    {items.map((item) => (
                        <SortableCard
                            key={item.id}
                            item={item}
                            onSelect={onSelect}
                            dragDisabled={disabled}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
