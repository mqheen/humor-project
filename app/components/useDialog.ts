'use client';

import { useEffect, useRef } from 'react';

// Shared modal behaviour: Escape calls onClose, Tab stays inside the dialog, the page behind doesn't scroll,
// focus lands on the element matching the `initialFocus` selector (or the first focusable thing) and goes back to where it was on close.
export function useDialog(open: boolean, onClose: (() => void) | null, initialFocus?: string) {
    const ref = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    // Latest callback, kept out of the open/close effect's dependencies.
    useEffect(() => { closeRef.current = onClose; });

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        const focusables = () => Array.from(
            ref.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [],
        );
        const wanted = initialFocus ? ref.current?.querySelector<HTMLElement>(initialFocus) : null;
        // preventScroll: a tall dialog should open at its top, not scrolled to the focused button.
        (wanted ?? focusables()[0] ?? ref.current)?.focus({ preventScroll: true });

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && closeRef.current) { e.preventDefault(); closeRef.current(); return; }
            if (e.key !== 'Tab') return;
            const items = focusables();
            if (!items.length) { e.preventDefault(); return; }
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = overflow;
            previous?.focus();
        };
    }, [open]);

    return ref;
}
