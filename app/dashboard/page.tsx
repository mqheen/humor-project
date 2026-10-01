import { createClient } from '@/app/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function DashboardPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url, created_at')
        .eq('id', user.id)
        .single();

    const { count } = await supabase.from('images').select('*', { count: 'exact', head: true });

    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || user.email;
    const memberSince = profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—';

    return (
        <main className="container" style={{ padding: '3rem 1.5rem 5rem' }}>
            <div className="panel">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div className="avatar avatar-lg">
                        {profile?.avatar_url ? <img src={profile.avatar_url} alt={name ?? ''} /> : 'No photo'}
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <p className="eyebrow">Dashboard</p>
                        <h1 style={{ margin: '0 0 0.3rem', fontSize: '2rem', letterSpacing: '-0.03em' }}>Welcome, {name}</h1>
                        <p className="muted" style={{ margin: 0 }}>{user.email}</p>
                    </div>
                    <Link href="/profile" className="btn">Edit profile</Link>
                </div>

                <div className="stat-grid">
                    <div className="stat">
                        <p className="stat-label">Images in gallery</p>
                        <p className="stat-value">{count ?? 0}</p>
                    </div>
                    <div className="stat">
                        <p className="stat-label">Member since</p>
                        <p className="stat-value">{memberSince}</p>
                    </div>
                    <div className="stat">
                        <p className="stat-label">Access level</p>
                        <p className="stat-value">Signed in</p>
                    </div>
                </div>
            </div>
        </main>
    );
}