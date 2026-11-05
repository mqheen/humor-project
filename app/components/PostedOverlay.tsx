'use client';

import { useState } from 'react';
import CatCard from '@/app/components/CatCard';
import { useDialog } from '@/app/components/useDialog';

type Cat = { id: number; image_url: string; cat_name: string; bio: string; tip: string | null; neighborhood: string | null; location: string | null };

// X counts every link as 23 characters, so the roast gets what is left of 280 after the link and a space.
const tweetText = (cat: Cat) => {
    const room = 280 - 23 - 1;
    const roast = (cat.tip ?? cat.cat_name).trim();
    return roast.length <= room ? roast : `${roast.slice(0, room - 1).trimEnd()}…`;
};

// Full-screen "it's live" moment after Post it: the posted card plus ways to share the public /cat/[id] page.
export default function PostedOverlay({ cat, onFeed, onAnother }: { cat: Cat; onFeed: () => void; onAnother: () => void }) {
    const ref = useDialog(true, null, '[data-first]');
    // This only mounts in the browser after Post it, so window and navigator are safe to read up front.
    const [url] = useState(() => `${window.location.origin}/cat/${cat.id}`);
    const [canShare] = useState(() => typeof navigator.share === 'function');
    const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied('yes');
        } catch {
            setCopied('failed');
        }
        setTimeout(() => setCopied(null), 2200);
    };

    const share = async () => {
        try {
            await navigator.share({ title: `${cat.cat_name} roasts ${cat.neighborhood ?? 'New York'}`, text: tweetText(cat), url });
        } catch { /* dismissed the share sheet */ }
    };

    const xHref = `https://x.com/intent/post?${new URLSearchParams({ text: tweetText(cat), url })}`;

    return (
        <div className="posted-overlay">
            <div ref={ref} className="posted-inner" role="dialog" aria-modal="true" aria-labelledby="posted-title" tabIndex={-1}>
                <h1 id="posted-title" className="panel-title posted-title">Posted to the feed</h1>
                <p className="panel-lede posted-lede">Send it to someone who needs to hear this cat’s opinion.</p>

                <CatCard
                    imageUrl={cat.image_url}
                    alt={cat.cat_name}
                    name={cat.cat_name}
                    place={cat.neighborhood ?? cat.location}
                    roast={cat.tip}
                    bio={cat.bio}
                />

                <div className="share-row">
                    <button type="button" data-first onClick={copy} className="btn">
                        {copied === 'yes' ? 'Link copied ✓' : copied === 'failed' ? 'Copy failed' : 'Copy link'}
                    </button>
                    {canShare && <button type="button" onClick={share} className="btn">Share</button>}
                    <a href={xHref} target="_blank" rel="noopener noreferrer" className="btn">Post to X</a>
                </div>
                <p className="sr-only" role="status">{copied === 'yes' ? 'Link copied to clipboard' : copied === 'failed' ? 'Could not copy the link' : ''}</p>

                <div className="posted-actions">
                    <button type="button" onClick={onFeed} className="btn btn-primary btn-lg">See it in the feed</button>
                    <button type="button" onClick={onAnother} className="btn btn-lg">Make another</button>
                </div>
            </div>
        </div>
    );
}
