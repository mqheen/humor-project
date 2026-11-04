'use client';

import { use } from 'react';
import { createClient } from '@/app/lib/supabase/client';

export default function LoginPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
    const { denied } = use(searchParams);
    const supabase = createClient();

    const signInWithGoogle = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
    };

    return (
        <main className="center-screen">
            <div className="panel" style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
                <h1 className="panel-title">Sign in</h1>
                <p className="panel-lede" style={{ marginInline: 'auto' }}>Use your Google account to continue.</p>
                {denied === '1' && <p className="error" role="alert">Sign-ups are currently limited. Ask Maheen to add your email.</p>}
                <button onClick={signInWithGoogle} className="btn btn-block btn-lg">
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.5 17.7 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/>
                        <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z"/>
                        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4-13.6-9.7l-7.8 6C6.5 42.6 14.6 48 24 48z"/>
                    </svg>
                    Continue with Google
                </button>
            </div>
        </main>
    );
}