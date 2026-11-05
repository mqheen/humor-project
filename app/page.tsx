import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/server';
import VoteButtons from '@/app/components/VoteButtons';
import Storefront from '@/app/components/Storefront';
import CatCard from '@/app/components/CatCard';
import FeedBrowser, { type FeedRow } from '@/app/components/FeedBrowser';
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
    votes: Vote[];
};

const FEATURED_FIELDS = 'id, image_url, cat_name, neighborhood, location, tip, created_at, votes(value, user_id)';

// Every query here filters is_published = true: RLS lets owners see their own drafts, and drafts must never reach the feed.
export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string; neighborhood?: string; hood?: string }> }) {
    const { sort, neighborhood: hoodParam, hood: legacyHoodParam } = await searchParams;
    const hoodValue = hoodParam ?? legacyHoodParam;
    const hood = isNeighborhood(hoodValue) ? hoodValue : null;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let feed = supabase
        .from('generations')
        .select('id, image_url, location, cat_name, bio, created_at, kind, neighborhood, tip, profiles(first_name, last_name, avatar_url, streak, last_active), votes(value, user_id)')
        .eq('is_published', true)
        .order('created_at', { ascending: false });
    if (hood) feed = feed.eq('neighborhood', hood);

    const [{ data }, { data: hoodRows }, featured] = await Promise.all([
        feed,
        supabase.from('generations').select('neighborhood').eq('is_published', true).not('neighborhood', 'is', null),
        catOfTheDay(supabase),
    ]);

    const rows: FeedRow[] = ((data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        imageUrl: r.image_url,
        name: r.cat_name,
        place: r.neighborhood ?? r.location,
        bio: r.bio,
        roast: r.tip,
        made: r.kind === 'generated',
        score: r.votes.reduce((s, v) => s + v.value, 0),
        myVote: (user ? r.votes.find((v) => v.user_id === user.id)?.value ?? null : null) as 1 | -1 | null,
        posterName: [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(' ') || 'Anonymous',
        avatarUrl: r.profiles?.avatar_url ?? null,
        // Formatted here, not in the browser, so server and client render the same text.
        dateLabel: new Date(r.created_at).toLocaleDateString(),
        badge: streakTitle(liveStreak(r.profiles?.streak, r.profiles?.last_active)),
    }));

    // Chips: only neighborhoods with at least one cat, in the fixed order.
    const present = new Set((hoodRows ?? []).map((r) => r.neighborhood));
    const hoods = NEIGHBORHOODS.filter((n) => present.has(n));

    return (
        <main>
            <Storefront id="feed" wide>
                <div className="sign-split">
                    <div>
                        <h1>New York’s cats have opinions about your neighborhood.</h1>
                        <p>One cat per neighborhood. A fresh roast every day. You decide what’s funny.</p>
                        <div className="sign-actions">
                            <Link href="/spot" className="btn btn-primary btn-lg">Make a cat</Link>
                            <Link href="/spot?tab=spot" className="text-link">Roast a real cat</Link>
                        </div>
                    </div>
                    {featured && <CatOfTheDay cat={featured} userId={user?.id ?? null} />}
                </div>
            </Storefront>

            <div className="container">
                <FeedBrowser rows={rows} hoods={hoods} hood={hood} sort={sort === 'top' ? 'top' : 'new'} userId={user?.id ?? null} />
            </div>
        </main>
    );
}

// Highest score from votes cast in the last 24 hours (ties go to the newest cat);
// with no positive scores today, fall back to the newest published AI-made cat.
async function catOfTheDay(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Featured | null> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentVotes } = await supabase.from('votes').select('generation_id, value').gte('created_at', since);

    const scores = new Map<number, number>();
    for (const v of recentVotes ?? []) scores.set(v.generation_id, (scores.get(v.generation_id) ?? 0) + v.value);
    const best = Math.max(0, ...scores.values());

    if (best > 0) {
        const ids = [...scores].filter(([, s]) => s === best).map(([id]) => id);
        const { data } = await supabase.from('generations').select(FEATURED_FIELDS).in('id', ids).eq('is_published', true)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (data) return data as unknown as Featured;
    }

    const { data } = await supabase.from('generations').select(FEATURED_FIELDS).eq('kind', 'generated').eq('is_published', true)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return (data as unknown as Featured) ?? null;
}

function CatOfTheDay({ cat, userId }: { cat: Featured; userId: string | null }) {
    const score = cat.votes.reduce((s, v) => s + v.value, 0);
    const myVote = (userId ? cat.votes.find((v) => v.user_id === userId)?.value ?? null : null) as 1 | -1 | null;
    return (
        <div className="cotd-wrap">
            <span className="cotd-label">Cat of the Day</span>
            <CatCard
                as="aside"
                className="cotd"
                nameId="cotd-name"
                href={`/cat/${cat.id}`}
                imageUrl={cat.image_url}
                alt={cat.cat_name}
                name={cat.cat_name}
                place={cat.neighborhood ?? cat.location}
                roast={cat.tip}
                footer={(
                    <div className="cotd-votes">
                        <VoteButtons labeled generationId={cat.id} initialScore={score} initialVote={myVote} userId={userId} />
                    </div>
                )}
            />
        </div>
    );
}
