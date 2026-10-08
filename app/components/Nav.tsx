'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export default function Nav() {
    const supabase = createClient();
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);
    const linksRef = useRef<HTMLElement>(null);
    const barRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
            setUser(session?.user ?? null);
        });
        return () => subscription.unsubscribe();
    }, []);

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
                    <Link href="/spot" className={cls('/spot')} aria-current={pathname === '/spot' ? 'page' : undefined}>Spot a cat</Link>
                    <Link href="/adopt" className={cls('/adopt')} aria-current={pathname === '/adopt' ? 'page' : undefined}>Adopt</Link>
                    {user && <Link href="/dashboard" className={cls('/dashboard')} aria-current={pathname === '/dashboard' ? 'page' : undefined}>Dashboard</Link>}
                    {user && <Link href="/profile" className={cls('/profile')} aria-current={pathname === '/profile' ? 'page' : undefined}>Profile</Link>}
                    <span className="nav-bar" ref={barRef} aria-hidden="true" />
                </nav>
                <div className="nav-auth">
                    {user ? (
                        <button onClick={signOut} className="btn">Sign out</button>
                    ) : (
                        <Link href="/login" className="btn btn-primary">Sign in</Link>
                    )}
                </div>
            </div>
        </header>
    );
}
