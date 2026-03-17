import React, { useEffect, useRef } from 'react';

/** 内容に応じて高さが自動調整される textarea。 */
export function AutoHeightTextarea({
    value,
    onChange,
    className,
    ...props
}: React.ComponentPropsWithoutRef<'textarea'>) {
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const ta = ref.current;
        if (!ta) return;
        ta.style.height = 'auto';
        const str = typeof value === 'string' ? value : '';
        if (str.trim().length > 0) {
            ta.style.height = ta.scrollHeight + 'px';
        }
    }, [value]);

    return (
        <textarea
            ref={ref}
            value={value}
            onChange={onChange}
            className={className}
            style={{ overflow: 'hidden' }}
            {...props}
        />
    );
}
