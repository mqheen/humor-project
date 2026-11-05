'use client';

import { useState, useTransition } from 'react';
import ConfirmDialog from '@/app/components/ConfirmDialog';
import { discardGeneration, publishGeneration } from '@/app/spot/actions';

type Action = (id: number) => Promise<{ ok: true } | { ok: false; error: string }>;

// Drafts can be posted or thrown away; posted cats can be deleted. The actions revalidate the page they're on.
export default function OwnerActions({ id, mode }: { id: number; mode: 'draft' | 'posted' }) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState('');
    const [confirming, setConfirming] = useState(false);

    const run = (action: Action, then?: () => void) => {
        setError('');
        startTransition(async () => {
            const res = await action(id);
            if (!res.ok) setError(res.error);
            then?.();
        });
    };

    return (
        <>
            <div className="owner-actions">
                {mode === 'draft' ? (
                    <>
                        <button onClick={() => run(publishGeneration)} disabled={pending} className="btn btn-primary">Post it</button>
                        <button onClick={() => setConfirming(true)} disabled={pending} className="btn">Discard</button>
                    </>
                ) : (
                    <button onClick={() => setConfirming(true)} disabled={pending} className="btn">Delete</button>
                )}
            </div>
            {error && <p className="error" role="alert" style={{ marginTop: '0.75rem', marginBottom: 0 }}>{error}</p>}
            <ConfirmDialog
                open={confirming}
                title={mode === 'draft' ? 'Throw this cat away?' : 'Delete this cat and its votes?'}
                confirmLabel={mode === 'draft' ? 'Throw it away' : 'Delete it'}
                busy={pending}
                onCancel={() => setConfirming(false)}
                onConfirm={() => run(discardGeneration, () => setConfirming(false))}
            />
        </>
    );
}
