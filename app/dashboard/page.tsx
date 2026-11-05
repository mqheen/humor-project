import { createClient } from '@/app/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import ProfileCard from '@/app/components/ProfileCard';
import LoyaltyPunches from '@/app/components/LoyaltyPunches';
import CatCard from '@/app/components/CatCard';
import OwnerActions from '@/app/components/OwnerActions';
import { scoreLabel } from '@/app/lib/votes';
import { liveStreak, nextMilestone, streakTitle } from '@/app/lib/nyc';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
    const { setup } = await searchParams;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url, created_at, streak, best_streak, last_active')
        .eq('id', user.id)
        .single();

    const { data: mine } = await supabase
        .from('generations')
        .select('id, image_url, cat_name, bio, tip, kind, location, neighborhood, created_at, is_published, votes(value)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    // RLS shows an owner their own drafts too; split them here and keep every count to published cats.
    const all = (mine ?? []).map((g) => ({ ...g, score: (g.votes as { value: number }[]).reduce((s, v) => s + v.value, 0) }));
    const drafts = all.filter((g) => !g.is_published);
    const posts = all.filter((g) => g.is_published);
    const totalScore = posts.reduce((s, p) => s + p.score, 0);

    const streak = liveStreak(profile?.streak, profile?.last_active);
    const bestStreak = profile?.best_streak ?? 0;
    const next = nextMilestone(streak);

    const memberSince = profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—';

    return (
        <main className="container" style={{ padding: '3rem 1.5rem 5rem' }}>
            <ProfileCard
                userId={user.id}
                email={user.email ?? null}
                firstName={profile?.first_name ?? ''}
                lastName={profile?.last_name ?? ''}
                avatarUrl={profile?.avatar_url ?? ''}
                setup={setup === '1'}
            />

            <div className="stat-grid">
                <div className="stat"><p className="stat-label">Roasts you’ve posted</p><p className="stat-value">{posts.length}</p></div>
                <div className="stat"><p className="stat-label">Votes received</p><p className="stat-value">{totalScore > 0 ? `+${totalScore}` : totalScore}</p></div>
                <div className="stat"><p className="stat-label">Member since</p><p className="stat-value">{memberSince}</p></div>
            </div>

            <section className="panel loyalty" aria-labelledby="loyalty-title">
                <div className="loyalty-head">
                    <h2 id="loyalty-title" className="loyalty-title">Bodega loyalty card</h2>
                    <span className="sticker">{streakTitle(streak)}</span>
                </div>
                <LoyaltyPunches streak={streak} />
                <p className="loyalty-text">
                    <strong>{streak}-day streak · best {bestStreak}</strong>
                    <span className="muted">
                        {next ? ` · ${next.days} more ${next.days === 1 ? 'day' : 'days'} to ${next.title}` : ' · Top title. The block is yours.'}
                    </span>
                </p>
                <p className="muted loyalty-hint">Vote or post a cat once a day to punch your card.</p>
            </section>

            {drafts.length > 0 && (
                <>
                    <h2 className="section-title">Drafts</h2>
                    <p className="muted" style={{ margin: 0 }}>Only you can see these. Post one when you’re happy with it.</p>
                    <section className="grid">
                        {drafts.map((d) => (
                            <CatCard
                                key={d.id}
                                headingLevel={3}
                                imageUrl={d.image_url}
                                alt={d.cat_name}
                                kindTag="Draft"
                                name={d.cat_name}
                                place={d.neighborhood ?? d.location}
                                bio={d.bio}
                                roast={d.tip}
                                footer={<OwnerActions id={d.id} mode="draft" />}
                            />
                        ))}
                    </section>
                </>
            )}

            <h2 className="section-title">Your cats</h2>
            {posts.length === 0 ? (
                <p className="muted">You haven’t posted a cat yet. <Link href="/spot">Make one</Link>.</p>
            ) : (
                <section className="grid">
                    {posts.map((p) => (
                        <CatCard
                            key={p.id}
                            headingLevel={3}
                            imageUrl={p.image_url}
                            alt={p.cat_name}
                            kindTag={p.kind === 'generated' ? 'AI-made' : 'Spotted'}
                            name={p.cat_name}
                            place={p.neighborhood ?? p.location}
                            bio={p.bio}
                            roast={p.tip}
                            votes={<span className="score-pill">{scoreLabel(p.score)}</span>}
                            footer={<OwnerActions id={p.id} mode="posted" />}
                        />
                    ))}
                </section>
            )}
        </main>
    );
}
