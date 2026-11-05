import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/app/lib/supabase/server';
import CatCard from '@/app/components/CatCard';
import VoteButtons from '@/app/components/VoteButtons';
import { liveStreak, streakTitle } from '@/app/lib/nyc';

type Vote = { value: number; user_id: string };
type Row = {
    id: number; image_url: string; location: string | null; cat_name: string; bio: string; created_at: string;
    kind: 'spotted' | 'generated'; neighborhood: string | null; tip: string | null;
    profiles: { first_name: string | null; last_name: string | null; avatar_url: string | null; streak: number | null; last_active: string | null } | null;
    votes: Vote[];
};

// generateMetadata and the page both need the row; cache() makes it one query per request.
// is_published = true keeps drafts off this public URL even for their owner.
const getCat = cache(async (rawId: string) => {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return null;
    const supabase = await createClient();
    const { data } = await supabase
        .from('generations')
        .select('id, image_url, location, cat_name, bio, created_at, kind, neighborhood, tip, profiles(first_name, last_name, avatar_url, streak, last_active), votes(value, user_id)')
        .eq('id', id)
        .eq('is_published', true)
        .maybeSingle();
    return (data as unknown as Row | null) ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const cat = await getCat((await params).id);
    if (!cat) return { title: 'Cat not found' };
    const title = `${cat.cat_name} roasts ${cat.neighborhood ?? 'New York'}`;
    const description = cat.tip ?? cat.bio;
    return {
        title,
        description,
        openGraph: { title, description, type: 'article', images: [{ url: cat.image_url, alt: cat.cat_name }] },
        twitter: { card: 'summary_large_image', title, description, images: [cat.image_url] },
    };
}

export default async function CatPage({ params }: { params: Promise<{ id: string }> }) {
    const cat = await getCat((await params).id);
    if (!cat) notFound();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const score = cat.votes.reduce((s, v) => s + v.value, 0);
    const myVote = (user ? cat.votes.find((v) => v.user_id === user.id)?.value ?? null : null) as 1 | -1 | null;
    const made = cat.kind === 'generated';
    const poster = [cat.profiles?.first_name, cat.profiles?.last_name].filter(Boolean).join(' ') || 'Anonymous';

    return (
        <main className="container cat-page">
            <CatCard
                className="cat-page-card"
                headingLevel={1}
                imageUrl={cat.image_url}
                alt={cat.cat_name}
                kindTag={made ? 'AI-made' : 'Spotted'}
                name={cat.cat_name}
                place={cat.neighborhood ?? cat.location}
                roast={cat.tip}
                bio={cat.bio}
                clampBio={false}
                votes={<VoteButtons generationId={cat.id} initialScore={score} initialVote={myVote} userId={user?.id ?? null} />}
                footer={(
                    <div className="poster">
                        <span className="avatar avatar-xs">
                            {cat.profiles?.avatar_url ? <img src={cat.profiles.avatar_url} alt="" /> : null}
                        </span>
                        <span>{made ? 'Made' : 'Spotted'} by {poster} on {new Date(cat.created_at).toLocaleDateString()}</span>
                        <span className="title-badge">{streakTitle(liveStreak(cat.profiles?.streak, cat.profiles?.last_active))}</span>
                    </div>
                )}
            />
            <div className="cat-page-actions">
                <Link href="/" className="btn">Back to the feed</Link>
                <Link href="/spot" className="btn btn-primary">Make your own cat</Link>
            </div>
        </main>
    );
}
