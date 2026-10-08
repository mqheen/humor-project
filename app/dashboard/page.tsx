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

    const { data: mine } = await supabase
        .from('generations')
        .select('id, image_url, cat_name, location, created_at, votes(value)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    const posts = (mine ?? []).map((g) => ({ ...g, score: (g.votes as { value: number }[]).reduce((s, v) => s + v.value, 0) }));
    const totalScore = posts.reduce((s, p) => s + p.score, 0);

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
                        <h1 className="panel-title" style={{ marginBottom: '0.3rem' }}>Welcome, {name}</h1>
                        <p className="muted" style={{ margin: 0 }}>{user.email}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <Link href="/spot" className="btn btn-primary">Spot a cat</Link>
                        <Link href="/profile" className="btn">Edit profile</Link>
                    </div>
                </div>

                <div className="stat-grid">
                    <div className="stat"><p className="stat-label">Cats you’ve posted</p><p className="stat-value">{posts.length}</p></div>
                    <div className="stat"><p className="stat-label">Votes received</p><p className="stat-value">{totalScore > 0 ? `+${totalScore}` : totalScore}</p></div>
                    <div className="stat"><p className="stat-label">Member since</p><p className="stat-value">{memberSince}</p></div>
                </div>
            </div>

            <h2 className="section-title">Your posts</h2>
            {posts.length === 0 ? (
                <p className="muted">You haven’t posted a cat yet. <Link href="/spot">Spot one</Link>.</p>
            ) : (
                <section className="grid">
                    {posts.map((p) => (
                        <article key={p.id} className="card">
                            <img src={p.image_url} alt={p.cat_name} />
                            <div className="card-body">
                                <div className="card-head">
                                    <div className="card-title">
                                        <h3 className="card-name">{p.cat_name}</h3>
                                        {p.location && <span className="sticker">{p.location}</span>}
                                    </div>
                                    <span className="card-meta">{p.score > 0 ? `+${p.score}` : p.score} votes</span>
                                </div>
                            </div>
                        </article>
                    ))}
                </section>
            )}
        </main>
    );
}