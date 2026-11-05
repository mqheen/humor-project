'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import CatCard from '@/app/components/CatCard';
import VoteButtons from '@/app/components/VoteButtons';

// Everything the grid needs, already formatted on the server (dates and titles included) so the
// client render matches the server render exactly.
export type FeedRow = {
    id: number; imageUrl: string; name: string; place: string | null;
    bio: string; roast: string | null; made: boolean; score: number; myVote: 1 | -1 | null;
    posterName: string; avatarUrl: string | null; dateLabel: string; badge: string;
};

const FIELDS = [
    { value: 'all', label: 'All' },
    { value: 'name', label: 'Name' },
    { value: 'neighborhood', label: 'Neighborhood' },
    { value: 'roast', label: 'Roast' },
    { value: 'bio', label: 'Bio' },
] as const;
type Field = (typeof FIELDS)[number]['value'];
const isField = (v: string | null): v is Field => FIELDS.some((f) => f.value === v);

const haystack = (r: FeedRow, field: Field) => {
    const parts: Record<Exclude<Field, 'all'>, string> = {
        name: r.name, neighborhood: r.place ?? '', roast: r.roast ?? '', bio: r.bio,
    };
    return (field === 'all' ? Object.values(parts).join('\n') : parts[field]).toLowerCase();
};

type Props = {
    rows: FeedRow[];
    hoods: string[];
    hood: string | null;
    sort: 'new' | 'top';
    userId: string | null;
};

export default function FeedBrowser({ rows, hoods, hood, sort, userId }: Props) {
    const params = useSearchParams();
    // Search lives in local state (so typing never waits on the server) and is mirrored into ?q= and ?field=.
    const [q, setQ] = useState(() => params.get('q') ?? '');
    const [field, setField] = useState<Field>(() => { const f = params.get('field'); return isField(f) ? f : 'all'; });

    const syncUrl = (nextQ: string, nextField: Field) => {
        const url = new URL(window.location.href);
        if (nextQ.trim()) url.searchParams.set('q', nextQ); else url.searchParams.delete('q');
        if (nextQ.trim() && nextField !== 'all') url.searchParams.set('field', nextField); else url.searchParams.delete('field');
        window.history.replaceState(window.history.state, '', url);
    };
    const update = (nextQ: string, nextField: Field) => { setQ(nextQ); setField(nextField); syncUrl(nextQ, nextField); };

    // Links keep the other controls: chips and sort carry the search, search never drops the chip or sort.
    const href = (next: { sort?: 'new' | 'top'; hood?: string | null }) => {
        const p = new URLSearchParams();
        const s = next.sort ?? sort;
        const h = next.hood !== undefined ? next.hood : hood;
        if (s === 'top') p.set('sort', 'top');
        if (h) p.set('neighborhood', h);
        if (q.trim()) {
            p.set('q', q);
            if (field !== 'all') p.set('field', field);
        }
        const qs = p.toString();
        return qs ? `/?${qs}` : '/';
    };

    const needle = q.trim().toLowerCase();
    const shown = (needle ? rows.filter((r) => haystack(r, field).includes(needle)) : rows)
        .slice()
        .sort((a, b) => (sort === 'top' ? b.score - a.score : 0));

    return (
        <>
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
                    <Link scroll={false} href={href({ sort: 'new' })} className={`seg${sort !== 'top' ? ' active' : ''}`} aria-current={sort !== 'top' ? 'page' : undefined}>New</Link>
                    <Link scroll={false} href={href({ sort: 'top' })} className={`seg${sort === 'top' ? ' active' : ''}`} aria-current={sort === 'top' ? 'page' : undefined}>Top</Link>
                </nav>
            </div>

            <form className="search-bar" role="search" onSubmit={(e) => e.preventDefault()}>
                <label className="sr-only" htmlFor="feed-q">Search cats</label>
                <input
                    id="feed-q" className="input search-input" type="search" value={q} placeholder="Search cats"
                    autoComplete="off" onChange={(e) => update(e.target.value, field)}
                />
                <label className="sr-only" htmlFor="feed-field">Search in</label>
                <select id="feed-field" className="input search-field" value={field} onChange={(e) => update(q, e.target.value as Field)}>
                    {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
            </form>
            <p className="sr-only" role="status">{needle ? `${shown.length} ${shown.length === 1 ? 'cat matches' : 'cats match'}` : ''}</p>

            {rows.length === 0 ? (
                <div className="empty">
                    <EmptyArt />
                    <p>{hood ? `No cats in ${hood} yet.` : 'No cats yet.'} You could be the first.</p>
                    <Link href="/spot" className="btn btn-primary btn-lg">Make a cat</Link>
                </div>
            ) : shown.length === 0 ? (
                <div className="empty">
                    <EmptyArt />
                    <p>No cats match</p>
                    <button type="button" className="btn" onClick={() => update('', 'all')}>Clear search</button>
                </div>
            ) : (
                <section className="grid">
                    {shown.map((r) => (
                        <CatCard
                            key={r.id}
                            href={`/cat/${r.id}`}
                            imageUrl={r.imageUrl}
                            alt={r.name}
                            kindTag={r.made ? 'AI-made' : 'Spotted'}
                            name={r.name}
                            place={r.place}
                            bio={r.bio}
                            roast={r.roast}
                            votes={<VoteButtons generationId={r.id} initialScore={r.score} initialVote={r.myVote} userId={userId} />}
                            footer={(
                                <div className="poster">
                                    <span className="avatar avatar-xs">
                                        {r.avatarUrl ? <img src={r.avatarUrl} alt="" /> : null}
                                    </span>
                                    <span>{r.made ? 'Made' : 'Spotted'} by {r.posterName} on {r.dateLabel}</span>
                                    <span className="title-badge">{r.badge}</span>
                                </div>
                            )}
                        />
                    ))}
                </section>
            )}
        </>
    );
}

function EmptyArt() {
    return (
        <svg width="200" height="170" viewBox="0 0 200 170" aria-hidden="true">
            <rect x="22" y="10" width="156" height="128" rx="4" fill="var(--sky)" stroke="var(--ink)" strokeWidth="3" />
            <path d="M100 10 V138 M22 72 H178" stroke="var(--ink)" strokeWidth="3" />
            <path d="M120 133 C142 135 148 116 137 106" fill="none" stroke="var(--ink)" strokeWidth="7" strokeLinecap="round" />
            <path d="M78 138 C73 112 82 92 100 92 C118 92 127 112 122 138 Z" fill="var(--ink)" />
            <circle cx="100" cy="80" r="17" fill="var(--ink)" />
            <path d="M86 74 L88 55 L99 66 Z M114 74 L112 55 L101 66 Z" fill="var(--ink)" strokeLinejoin="round" />
            <rect x="10" y="136" width="180" height="14" rx="3" fill="var(--butter)" stroke="var(--ink)" strokeWidth="3" />
        </svg>
    );
}
