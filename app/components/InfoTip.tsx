'use client';

import { useId, useState } from 'react';

type Props = {
    text: string;
    label?: string;
    align?: 'start' | 'end';
    // Wrap an existing focusable element instead of rendering the ⓘ button.
    children?: (props: { 'aria-describedby': string }) => React.ReactNode;
};

// Shows on hover and keyboard focus (styled in globals.css); Escape hides it until the pointer or focus leaves.
export default function InfoTip({ text, label = 'More info', align = 'start', children }: Props) {
    const id = useId();
    const [dismissed, setDismissed] = useState(false);
    const reset = () => setDismissed(false);

    return (
        <span
            className={`info-tip${align === 'end' ? ' info-tip-end' : ''}`}
            data-dismissed={dismissed || undefined}
            onKeyDown={(e) => { if (e.key === 'Escape') setDismissed(true); }}
            onMouseLeave={reset}
            onBlur={reset}
        >
            {children ? children({ 'aria-describedby': id }) : (
                <button type="button" className="info-btn" aria-label={label} aria-describedby={id}>ⓘ</button>
            )}
            <span role="tooltip" id={id} className="info-pop">{text}</span>
        </span>
    );
}
