'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import LoyaltyPunches from '@/app/components/LoyaltyPunches';
import { nextMilestone, nyDate, streakTitle } from '@/app/lib/nyc';

// touch_streak() only awards once per day, so call it once per page load.
// Module state also keeps React's dev double-mount from spending the award on a discarded effect.
let touched = false;

export default function DailyStamp() {
    const router = useRouter();
    const [streak, setStreak] = useState<number | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (touched) return;
        touched = true;
        const supabase = createClient();
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data, error } = await supabase.rpc('touch_streak');
            const row = (Array.isArray(data) ? data[0] : data) as { streak: number; awarded: boolean } | null;
            if (error || !row) return;
            // Nav shows the streak too; hand it the fresh value.
            window.dispatchEvent(new CustomEvent('streak', { detail: row.streak }));
            if (!row.awarded) return;
            // Server-rendered streaks (dashboard, feed badges) were read before this bump.
            router.refresh();

            const key = `stamp-shown-${nyDate(new Date())}`;
            try {
                if (sessionStorage.getItem(key)) return;
                sessionStorage.setItem(key, '1');
            } catch { /* storage blocked: still show it this once */ }
            setStreak(row.streak);
        })();
    }, [router]);

    const open = streak !== null;

    // While open: focus the button, Escape closes, page behind doesn't scroll. Focus goes back on close.
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        buttonRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setStreak(null); };
        document.addEventListener('keydown', onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = overflow;
            previous?.focus();
        };
    }, [open]);

    if (!open) return null;

    const title = streakTitle(streak);
    const promoted = streak > 1 && title !== streakTitle(streak - 1);
    const next = nextMilestone(streak);

    return (
        <div className="stamp-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setStreak(null); }}>
            <div
                className="panel stamp-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="stamp-title"
                // The button is the only control, so Tab stays on it.
                onKeyDown={(e) => { if (e.key === 'Tab') { e.preventDefault(); buttonRef.current?.focus(); } }}
            >
                {promoted && <span className="sticker stamp-new">New title</span>}
                <p className="kind-tag stamp-label">Daily stamp</p>
                <h2 id="stamp-title" className="stamp-title">{promoted ? `You’re a ${title} now` : `Day ${streak}`}</h2>
                <LoyaltyPunches streak={streak} stampNewest />
                <p className="stamp-text">
                    <strong>{title}</strong>
                    {next ? ` · ${next.days} more ${next.days === 1 ? 'day' : 'days'} to ${next.title}` : ' · Top title. The block is yours.'}
                </p>
                <button ref={buttonRef} onClick={() => setStreak(null)} className="btn btn-primary btn-block">Keep going</button>
            </div>
        </div>
    );
}
