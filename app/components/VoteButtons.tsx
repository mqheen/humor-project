'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
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

type Vote = 1 | -1 | null;
type Entry = { score: number; vote: Vote; seedScore: number; seedVote: Vote };

// One entry per cat, shared by every VoteButtons on the page. The same cat can be on screen twice (Cat of the
// Day and its feed card); each used to keep its own copy of the vote, so voting on the second one inserted a
// duplicate row, hit the unique (user_id, generation_id) constraint, and rolled back with no message.
// An entry only applies while the server-rendered numbers it was seeded from are still the ones in the props;
// when the server sends fresher numbers (refresh, navigation) the props win again.
const entries = new Map<number, Entry>();
const inflight = new Set<number>();
const listeners = new Map<number, Set<() => void>>();

const subscribeTo = (id: number) => (listener: () => void) => {
    const set = listeners.get(id) ?? new Set();
    set.add(listener);
    listeners.set(id, set);
    return () => { set.delete(listener); };
};
const publish = (id: number, entry: Entry) => {
    entries.set(id, entry);
    listeners.get(id)?.forEach((l) => l());
};

export default function VoteButtons({ generationId, initialScore, initialVote, userId, labeled = false }: Props) {
    const supabase = useMemo(() => createClient(), []);
    const router = useRouter();
    const [error, setError] = useState('');

    const subscribe = useMemo(() => subscribeTo(generationId), [generationId]);
    const getSnapshot = useCallback(() => entries.get(generationId), [generationId]);
    const shared = useSyncExternalStore(subscribe, getSnapshot, () => undefined);
    const live = shared && shared.seedScore === initialScore && shared.seedVote === initialVote ? shared : null;
    const score = live ? live.score : initialScore;
    const vote = live ? live.vote : initialVote;

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
        if (inflight.has(generationId)) return;
        inflight.add(generationId);
        setError('');

        const before: Entry = { score, vote, seedScore: initialScore, seedVote: initialVote };
        const next: Vote = vote === value ? null : value;
        const delta = (next ?? 0) - (vote ?? 0);
        publish(generationId, { ...before, score: score + delta, vote: next });

        // upsert covers both "first vote" and "change vote", so a stale local copy can't trip the unique constraint.
        const { error: writeError } = next === null
            ? await supabase.from('votes').delete().eq('generation_id', generationId).eq('user_id', userId)
            : await supabase.from('votes').upsert({ generation_id: generationId, user_id: userId, value: next }, { onConflict: 'user_id,generation_id' });

        if (writeError) {
            publish(generationId, before);
            setError('Your vote didn’t save. Try again.');
        }
        inflight.delete(generationId);
    };

    // Stamp only when a vote is being cast, not when clicking the same paw to remove it.
    const press = (value: 1 | -1) => {
        if (userId && !inflight.has(generationId) && vote !== value) setStamp({ dir: value, n: (stamp?.n ?? 0) + 1 });
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
            {error && <span className="sr-only" role="alert">{error}</span>}
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
