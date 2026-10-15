import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/server';
import VoteButtons from '@/app/components/VoteButtons';
import Storefront from '@/app/components/Storefront';
import CatTip from '@/app/components/CatTip';
import { NEIGHBORHOODS, isNeighborhood, liveStreak, streakTitle } from '@/app/lib/nyc';

type Vote = { value: number; user_id: string };
type Row = {
    id: number; image_url: string; location: string | null; cat_name: string; bio: string; created_at: string;
    kind: 'spotted' | 'generated'; neighborhood: string | null; tip: string | null;
    profiles: { first_name: string | null; last_name: string | null; avatar_url: string | null; streak: number | null; last_active: string | null } | null;
    votes: Vote[];
};
type Featured = {
    id: number; image_url: string; cat_name: string; neighborhood: string | null; location: string | null; tip: string | null;
    votes: { value: number }[];
};

const FEATURED_FIELDS = 'id, image_url, cat_name, neighborhood, location, tip, created_at, votes(value)';

export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string; hood?: string }> }) {
    const { sort, hood: hoodParam } = await searchParams;
    const hood = isNeighborhood(hoodParam) ? hoodParam : null;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let feed = supabase
        .from('generations')
        .select('id, image_url, location, cat_name, bio, created_at, kind, neighborhood, tip, profiles(first_name, last_name, avatar_url, streak, last_active), votes(value, user_id)')
        .order('created_at', { ascending: false });
    if (hood) feed = feed.eq('neighborhood', hood);

    const [{ data }, { data: hoodRows }, featured] = await Promise.all([
        feed,
        supabase.from('generations').select('neighborhood').not('neighborhood', 'is', null),
        catOfTheDay(supabase),
    ]);

    const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
        ...r,
        score: r.votes.reduce((s, v) => s + v.value, 0),
        myVote: (user ? r.votes.find((v) => v.user_id === user.id)?.value ?? null : null) as 1 | -1 | null,
    }));

    if (sort === 'top') rows.sort((a, b) => b.score - a.score);

    // Chips: only neighborhoods with at least one cat, in the fixed order.
    const present = new Set((hoodRows ?? []).map((r) => r.neighborhood));
    const hoods = NEIGHBORHOODS.filter((n) => present.has(n));

    const href = (next: { sort?: string | null; hood?: string | null }) => {
        const q = new URLSearchParams();
        const s = next.sort !== undefined ? next.sort : sort === 'top' ? 'top' : null;
        const h = next.hood !== undefined ? next.hood : hood;
        if (s) q.set('sort', s);
        if (h) q.set('hood', h);
        const qs = q.toString();
        return qs ? `/?${qs}` : '/';
    };

    return (
        <main>
            <Storefront id="feed" wide>
                <div className="sign-split">
                    <div>
                        <h1>Every neighborhood has a cat. Ask it where to go.</h1>
                        <p>AI-made cats, real New York tips, ranked by your votes.</p>
                        <div className="sign-actions">
                            <Link href="/spot" className="btn btn-primary btn-lg">Make a cat</Link>
                            <Link href="/spot?tab=spot" className="text-link">Spot a real one</Link>
                        </div>
                    </div>
                    {featured && <CatOfTheDay cat={featured} />}
                </div>
            </Storefront>

            <div className="container">
                <div className="feed-bar">
                    {hoods.length > 0 && (
                        <nav className="chips" aria-label="Filter by neighborhood">
                            <Link scroll={false} href={href({ hood: null })} className={`chip${!hood ? ' active' : ''}`} aria-current={!hood ? 'page' : undefined}>All</Link>
                            {hoods.map((n) => (
                                <Link key={n} scroll={false} href={href({ hood: n })} className={`chip${hood === n ? ' active' : ''}`} aria-current={hood === n ? 'page' : undefined}>{n}</Link>
                            ))}
                        </nav>
                    )}
                    <nav className="segmented" aria-label="Sort cats">
                        <Link scroll={false} href={href({ sort: null })} className={`seg${sort !== 'top' ? ' active' : ''}`} aria-current={sort !== 'top' ? 'page' : undefined}>New</Link>
                        <Link scroll={false} href={href({ sort: 'top' })} className={`seg${sort === 'top' ? ' active' : ''}`} aria-current={sort === 'top' ? 'page' : undefined}>Top</Link>
                    </nav>
                </div>

                {rows.length === 0 ? (
                    <div className="empty">
                        <svg width="200" height="170" viewBox="0 0 200 170" aria-hidden="true">
                            <rect x="22" y="10" width="156" height="128" rx="4" fill="var(--sky)" stroke="var(--ink)" strokeWidth="3" />
                            <path d="M100 10 V138 M22 72 H178" stroke="var(--ink)" strokeWidth="3" />
                            <path d="M120 133 C142 135 148 116 137 106" fill="none" stroke="var(--ink)" strokeWidth="7" strokeLinecap="round" />
                            <path d="M78 138 C73 112 82 92 100 92 C118 92 127 112 122 138 Z" fill="var(--ink)" />
                            <circle cx="100" cy="80" r="17" fill="var(--ink)" />
                            <path d="M86 74 L88 55 L99 66 Z M114 74 L112 55 L101 66 Z" fill="var(--ink)" strokeLinejoin="round" />
                            <rect x="10" y="136" width="180" height="14" rx="3" fill="var(--butter)" stroke="var(--ink)" strokeWidth="3" />
                        </svg>
                        <p>{hood ? `No cats in ${hood} yet.` : 'No cats yet.'} You could be the first.</p>
                        <Link href="/spot" className="btn btn-primary btn-lg">Make a cat</Link>
                    </div>
                ) : (
                    <section className="grid">
                        {rows.map((r) => {
                            const poster = [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(' ') || 'Anonymous';
                            const made = r.kind === 'generated';
                            const place = r.neighborhood ?? r.location;
                            return (
                                <article key={r.id} className="card">
                                    <img src={r.image_url} alt={r.cat_name} />
                                    <div className="card-body">
                                        <div className="card-head">
                                            <div className="card-title">
                                                <span className="kind-tag">{made ? 'AI-made' : 'Spotted'}</span>
                                                <h2 className="card-name">{r.cat_name}</h2>
                                                {place && <span className="sticker">{place}</span>}
                                            </div>
                                            <VoteButtons generationId={r.id} initialScore={r.score} initialVote={r.myVote} userId={user?.id ?? null} />
                                        </div>
                                        <p className="card-bio">{r.bio}</p>
                                        {r.tip && <CatTip tip={r.tip} />}
                                        <div className="poster">
                                            <span className="avatar avatar-xs">
                                                {r.profiles?.avatar_url ? <img src={r.profiles.avatar_url} alt="" /> : null}
                                            </span>
                                            <span>{made ? 'Made' : 'Spotted'} by {poster} on {new Date(r.created_at).toLocaleDateString()}</span>
                                            <span className="title-badge">{streakTitle(liveStreak(r.profiles?.streak, r.profiles?.last_active))}</span>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                )}
            </div>
        </main>
    );
}

// Highest score from votes cast in the last 24 hours (ties go to the newest cat);
// with no positive scores today, fall back to the newest AI-made cat.
async function catOfTheDay(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Featured | null> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentVotes } = await supabase.from('votes').select('generation_id, value').gte('created_at', since);

    const scores = new Map<number, number>();
    for (const v of recentVotes ?? []) scores.set(v.generation_id, (scores.get(v.generation_id) ?? 0) + v.value);
    const best = Math.max(0, ...scores.values());

    if (best > 0) {
        const ids = [...scores].filter(([, s]) => s === best).map(([id]) => id);
        const { data } = await supabase.from('generations').select(FEATURED_FIELDS).in('id', ids)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (data) return data as unknown as Featured;
    }

    const { data } = await supabase.from('generations').select(FEATURED_FIELDS).eq('kind', 'generated')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return (data as unknown as Featured) ?? null;
}

function CatOfTheDay({ cat }: { cat: Featured }) {
    const score = cat.votes.reduce((s, v) => s + v.value, 0);
    const place = cat.neighborhood ?? cat.location;
    return (
        <aside className="card cotd" aria-labelledby="cotd-name">
            <span className="cotd-label">Cat of the Day</span>
            <img src={cat.image_url} alt={cat.cat_name} />
            <div className="card-body">
                <div className="card-head">
                    <div className="card-title">
                        <h2 id="cotd-name" className="card-name">{cat.cat_name}</h2>
                        {place && <span className="sticker">{place}</span>}
                    </div>
                    <span className="cotd-score" aria-label={`Score ${score}`}>{score > 0 ? `+${score}` : score}</span>
                </div>
                {cat.tip && <CatTip tip={cat.tip} />}
            </div>
        </aside>
    );
}
