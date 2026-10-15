'use client';

import { useEffect, useState } from 'react';

// Module state survives client-side navigation but resets on a full page load,
// so each awning unrolls once per load and stays put when you navigate back.
const played = new Set<string>();

type Props = { id: string; variant?: 'mint'; wide?: boolean; children: React.ReactNode };

export default function Storefront({ id, variant, wide, children }: Props) {
    const [enter] = useState(() => !played.has(id));
    useEffect(() => { played.add(id); }, [id]);

    return (
        <section className={`storefront${enter ? ' storefront-enter' : ''}`}>
            <div className={`awning${variant === 'mint' ? ' awning-mint' : ''}`} aria-hidden="true" />
            <div className="container">
                <div className={`sign${wide ? ' sign-wide' : ''}`}>{children}</div>
            </div>
        </section>
    );
}
