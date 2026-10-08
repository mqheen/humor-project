import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/server';
import VoteButtons from '@/app/components/VoteButtons';
import Storefront from '@/app/components/Storefront';

type Vote = { value: number; user_id: string };
type Row = {
    id: number; image_url: string; location: string | null; cat_name: string; bio: string; created_at: string;
    profiles: { first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
    votes: Vote[];
};

export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
    const { sort } = await searchParams;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data } = await supabase
        .from('generations')
        .select('id, image_url, location, cat_name, bio, created_at, profiles(first_name, last_name, avatar_url), votes(value, user_id)')
        .order('created_at', { ascending: false });

    const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
        ...r,
        score: r.votes.reduce((s, v) => s + v.value, 0),
        myVote: (user ? r.votes.find((v) => v.user_id === user.id)?.value ?? null : null) as 1 | -1 | null,
    }));

    if (sort === 'top') rows.sort((a, b) => b.score - a.score);

    return (
        <main>
            <Storefront id="feed">
                <h1>Every corner store has a cat.</h1>
                <p>Spotted one in the city? Post it and the AI writes its New York backstory. Vote for the ones that deserve a key to the city.</p>
                <div className="sign-actions">
                    <Link href="/spot" className="btn btn-primary btn-lg">Spot a cat</Link>
                    <nav className="segmented" aria-label="Sort cats">
                        <Link href="/" className={`seg${sort !== 'top' ? ' active' : ''}`} aria-current={sort !== 'top' ? 'page' : undefined}>New</Link>
                        <Link href="/?sort=top" className={`seg${sort === 'top' ? ' active' : ''}`} aria-current={sort === 'top' ? 'page' : undefined}>Top</Link>
                    </nav>
                </div>
            </Storefront>

            <div className="container">
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
                        <p>No cats yet. You could be the first.</p>
                        <Link href="/spot" className="btn btn-primary btn-lg">Spot a cat</Link>
                    </div>
                ) : (
                    <section className="grid">
                        {rows.map((r) => {
                            const poster = [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(' ') || 'Anonymous';
                            return (
                                <article key={r.id} className="card">
                                    <img src={r.image_url} alt={r.cat_name} />
                                    <div className="card-body">
                                        <div className="card-head">
                                            <div className="card-title">
                                                <h2 className="card-name">{r.cat_name}</h2>
                                                {r.location && <span className="sticker">{r.location}</span>}
                                            </div>
                                            <VoteButtons generationId={r.id} initialScore={r.score} initialVote={r.myVote} userId={user?.id ?? null} />
                                        </div>
                                        <p className="card-bio">{r.bio}</p>
                                        <div className="poster">
                                            <span className="avatar avatar-xs">
                                                {r.profiles?.avatar_url ? <img src={r.profiles.avatar_url} alt="" /> : null}
                                            </span>
                                            <span>Spotted by {poster} on {new Date(r.created_at).toLocaleDateString()}</span>
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
