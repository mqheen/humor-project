'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import StreakPill from '@/app/components/StreakPill';
import { liveStreak } from '@/app/lib/nyc';

export default function Nav() {
    const supabase = createClient();
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);
    const [streak, setStreak] = useState(0);
    const linksRef = useRef<HTMLElement>(null);
    const barRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
            setUser(session?.user ?? null);
        });
        return () => subscription.unsubscribe();
    }, []);

    // Read the streak on sign-in and on navigation (posting a cat bumps it server-side); DailyStamp broadcasts the value touch_streak returns on page load.
    useEffect(() => {
        if (!user) return;
        supabase.from('profiles').select('streak, last_active').eq('id', user.id).single()
            .then(({ data }) => setStreak(liveStreak(data?.streak, data?.last_active)));
        const onStreak = (e: Event) => setStreak((e as CustomEvent<number>).detail);
        window.addEventListener('streak', onStreak);
        return () => window.removeEventListener('streak', onStreak);
    }, [user?.id, pathname]);

    const signOut = async () => {
        await supabase.auth.signOut();
        router.push('/');
        router.refresh();
    };

    // One underline bar, moved under the active link on route change and resize.
    useEffect(() => {
        const place = () => {
            const links = linksRef.current, bar = barRef.current;
            if (!links || !bar) return;
            const active = links.querySelector<HTMLElement>('.nav-link.active');
            if (!active) { bar.style.opacity = '0'; return; }
            const width = Math.max(18, Math.round(active.offsetWidth * 0.35));
            bar.style.width = `${width}px`;
            bar.style.transform = `translateX(${active.offsetLeft + (active.offsetWidth - width) / 2}px)`;
            bar.style.opacity = '1';
        };
        place();
        // Turn on the slide only after the first placement, so it doesn't sweep in on load.
        const raf = requestAnimationFrame(() => barRef.current?.classList.add('ready'));
        document.fonts?.ready.then(place);
        window.addEventListener('resize', place);
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', place); };
    }, [pathname, user]);

    const cls = (href: string) => `nav-link${pathname === href ? ' active' : ''}`;

    return (
        <header className="nav">
            <div className="container nav-inner">
                <Link href="/" className="brand">
                    <svg className="brand-cat" width="28" height="24" viewBox="0 0 28 24" aria-hidden="true">
                        <path d="M3.5 13 L5 2.5 L10.5 7.4 Q14 6.6 17.5 7.4 L23 2.5 L24.5 13 Q24.5 22 14 22 Q3.5 22 3.5 13 Z" fill="var(--butter)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" />
                        <circle cx="10" cy="13" r="1.4" fill="var(--ink)" />
                        <circle cx="18" cy="13" r="1.4" fill="var(--ink)" />
                        <path d="M12.6 16 h2.8 l-1.4 1.7 z" fill="var(--red)" stroke="var(--ink)" strokeWidth="0.8" strokeLinejoin="round" />
                    </svg>
                    Bodega Cats
                </Link>
                <nav className="nav-links" aria-label="Main" ref={linksRef}>
                    <Link href="/" className={cls('/')} aria-current={pathname === '/' ? 'page' : undefined}>Feed</Link>
                    <Link href="/spot" className={cls('/spot')} aria-current={pathname === '/spot' ? 'page' : undefined}>Make a cat</Link>
                    <Link href="/neighborhoods" className={cls('/neighborhoods')} aria-current={pathname === '/neighborhoods' ? 'page' : undefined}>Neighborhoods</Link>
                    {user && <Link href="/dashboard" className={cls('/dashboard')} aria-current={pathname === '/dashboard' ? 'page' : undefined}>Dashboard</Link>}
                    <span className="nav-bar" ref={barRef} aria-hidden="true" />
                </nav>
                <div className="nav-auth">
                    {user ? (
                        <>
                            {streak > 0 && <StreakPill streak={streak} />}
                            <button onClick={signOut} className="btn">Sign out</button>
                        </>
                    ) : (
                        <Link href="/login" className="btn btn-primary">Sign in</Link>
                    )}
                </div>
            </div>
        </header>
    );
}
