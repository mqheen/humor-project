'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export default function Nav() {
    const supabase = createClient();
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);

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

    const cls = (href: string) => `nav-link${pathname === href ? ' active' : ''}`;

    return (
        <header className="nav">
            <div className="container nav-inner">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Link href="/" className="brand"><span className="brand-dot" />Nine Lives</Link>
                    <nav className="nav-links">
                        <Link href="/" className={cls('/')}>Adopt</Link>
                        {user && <Link href="/dashboard" className={cls('/dashboard')}>Dashboard</Link>}
                        {user && <Link href="/profile" className={cls('/profile')}>Profile</Link>}
                    </nav>
                </div>
                {user ? (
                    <button onClick={signOut} className="btn">Sign out</button>
                ) : (
                    <Link href="/login" className="btn btn-primary">Sign in</Link>
                )}
            </div>
        </header>
    );
}