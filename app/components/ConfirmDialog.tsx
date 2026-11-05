'use client';

import { useId } from 'react';
import { useDialog } from '@/app/components/useDialog';

type Props = {
    open: boolean;
    title: string;
    body?: string;
    confirmLabel: string;
    cancelLabel?: string;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

// A small flyer-style modal in place of window.confirm. Escape and a click outside the panel cancel;
// focus starts on the safe choice (cancel) so Enter can't throw a cat away by accident.
export default function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel = 'Keep it', busy = false, onConfirm, onCancel }: Props) {
    const titleId = useId();
    const bodyId = useId();
    const ref = useDialog(open, busy ? null : onCancel, '[data-cancel]');
    if (!open) return null;

    return (
        <div className="stamp-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
            <div
                ref={ref}
                className="panel confirm-panel"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={body ? bodyId : undefined}
                tabIndex={-1}
            >
                <h2 id={titleId} className="confirm-title">{title}</h2>
                {body && <p id={bodyId} className="confirm-body">{body}</p>}
                <div className="confirm-actions">
                    <button type="button" data-cancel onClick={onCancel} disabled={busy} className="btn">{cancelLabel}</button>
                    <button type="button" onClick={onConfirm} disabled={busy} className="btn btn-primary">{busy ? 'Working…' : confirmLabel}</button>
                </div>
            </div>
        </div>
    );
}
