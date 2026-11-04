'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { scoreLabel } from '@/app/lib/votes';

type Props = {
    generationId: number;
    initialScore: number;
    initialVote: 1 | -1 | null;
    userId: string | null;
    // Cat of the Day: shows "▲ N votes" beside the paws and disables them when signed out.
    labeled?: boolean;
};

export default function VoteButtons({ generationId, initialScore, initialVote, userId, labeled = false }: Props) {
    const supabase = createClient();
    const router = useRouter();
    const [score, setScore] = useState(initialScore);
    const [vote, setVote] = useState<1 | -1 | null>(initialVote);
    const [busy, setBusy] = useState(false);

    // Motion-only state: which paw to stamp, and the outgoing score for the slide.
    const [stamp, setStamp] = useState<{ dir: 1 | -1; n: number } | null>(null);
    const [shownScore, setShownScore] = useState(score);
    const [outgoing, setOutgoing] = useState<number | null>(null);
    const [tick, setTick] = useState(0);
    if (score !== shownScore) {
        setOutgoing(shownScore);
        setShownScore(score);
        setTick(tick + 1);
    }

    const cast = async (value: 1 | -1) => {
        if (!userId) { router.push('/login'); return; }
        if (busy) return;
        setBusy(true);

        const prev = vote;
        const prevScore = score;

        if (prev === value) {
            setVote(null); setScore(score - value);
            const { error } = await supabase.from('votes').delete().eq('generation_id', generationId).eq('user_id', userId);
            if (error) { setVote(prev); setScore(prevScore); }
        } else if (prev) {
            setVote(value); setScore(score + 2 * value);
            const { error } = await supabase.from('votes').update({ value }).eq('generation_id', generationId).eq('user_id', userId);
            if (error) { setVote(prev); setScore(prevScore); }
        } else {
            setVote(value); setScore(score + value);
            const { error } = await supabase.from('votes').insert({ generation_id: generationId, user_id: userId, value });
            if (error) { setVote(prev); setScore(prevScore); }
        }
        setBusy(false);
    };

    // Stamp only when a vote is being cast, not when clicking the same paw to remove it.
    const press = (value: 1 | -1) => {
        if (userId && !busy && vote !== value) setStamp({ dir: value, n: (stamp?.n ?? 0) + 1 });
        cast(value);
    };

    const ring = (dir: 1 | -1) => stamp?.dir === dir && <span key={stamp.n} className="stamp-ring" aria-hidden="true" />;

    const locked = labeled && !userId;
    return (
        <div className={`votes${labeled ? ' votes-labeled' : ''}`} title={locked ? 'Sign in to vote' : undefined}>
            <button onClick={() => press(1)} disabled={locked} className={`vote-btn${vote === 1 ? ' up' : ''}`} aria-label="Upvote: funny roast" aria-pressed={vote === 1} title={userId ? 'Funny' : 'Sign in to vote'}>
                <Paw key={`up-${stamp?.dir === 1 ? stamp.n : 0}`} stamping={stamp?.dir === 1} />
                {ring(1)}
            </button>
            <span className="vote-score" aria-live={labeled ? 'polite' : undefined}>
                {labeled ? scoreLabel(score) : (
                    <>
                        {outgoing !== null && <span key={`out-${tick}`} className="score-out" aria-hidden="true">{outgoing}</span>}
                        <span key={`in-${tick}`} className={tick ? 'score-in' : undefined}>{score}</span>
                    </>
                )}
            </span>
            <button onClick={() => press(-1)} disabled={locked} className={`vote-btn${vote === -1 ? ' down' : ''}`} aria-label="Downvote: not funny" aria-pressed={vote === -1} title={userId ? 'Not funny' : 'Sign in to vote'}>
                <Paw key={`down-${stamp?.dir === -1 ? stamp.n : 0}`} down stamping={stamp?.dir === -1} />
                {ring(-1)}
            </button>
        </div>
    );
}

function Paw({ down = false, stamping = false }: { down?: boolean; stamping?: boolean }) {
    return (
        <svg className={`paw${down ? ' paw-down' : ''}${stamping ? ' stamp' : ''}`} width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <ellipse cx="12" cy="16.5" rx="5" ry="4.2" />
            <ellipse cx="5.2" cy="10.6" rx="2" ry="2.5" />
            <ellipse cx="9.4" cy="5.8" rx="2.1" ry="2.6" />
            <ellipse cx="14.6" cy="5.8" rx="2.1" ry="2.6" />
            <ellipse cx="18.8" cy="10.6" rx="2" ry="2.5" />
        </svg>
    );
}
