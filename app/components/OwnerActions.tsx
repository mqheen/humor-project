'use client';

import { useState, useTransition } from 'react';
import { discardGeneration, publishGeneration } from '@/app/spot/actions';

// Drafts can be posted or thrown away; posted cats can be deleted. The actions revalidate the page they're on.
export default function OwnerActions({ id, mode }: { id: number; mode: 'draft' | 'posted' }) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState('');

    const run = (action: (id: number) => Promise<{ ok: true } | { ok: false; error: string }>, confirmText?: string) => {
        if (confirmText && !confirm(confirmText)) return;
        setError('');
        startTransition(async () => {
            const res = await action(id);
            if (!res.ok) setError(res.error);
        });
    };

    return (
        <>
            <div className="owner-actions">
                {mode === 'draft' ? (
                    <>
                        <button onClick={() => run(publishGeneration)} disabled={pending} className="btn btn-primary">Post it</button>
                        <button onClick={() => run(discardGeneration, 'Throw this cat away?')} disabled={pending} className="btn">Discard</button>
                    </>
                ) : (
                    <button onClick={() => run(discardGeneration, 'Delete this cat and its votes?')} disabled={pending} className="btn">Delete</button>
                )}
            </div>
            {error && <p className="error" role="alert" style={{ marginTop: '0.75rem', marginBottom: 0 }}>{error}</p>}
        </>
    );
}
