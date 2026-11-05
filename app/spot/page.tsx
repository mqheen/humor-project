'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { NEIGHBORHOODS, TEXT_LIMITS, VIBES, isNeighborhood } from '@/app/lib/nyc';
import PawIcon from '@/app/components/PawIcon';
import CatCard from '@/app/components/CatCard';
import ConfirmDialog from '@/app/components/ConfirmDialog';
import PostedOverlay from '@/app/components/PostedOverlay';
import { discardGeneration, publishGeneration, updateGenerationText } from '@/app/spot/actions';

type StepStatus = 'pending' | 'running' | 'done' | 'failed';
type StepState = { name: string; status: StepStatus };

// One JSON object per line from /api/generate. Mirrors StreamEvent in the route.
type GenerateEvent =
    | { steps: string[] }
    | { step: string; status: Exclude<StepStatus, 'pending'> }
    | { done: true; generation: Generation }
    | { error: string };

const STEP_LABELS: Record<string, string> = {
    'Draw the cat': 'Drawing the cat',
    'Look at the photo': 'Looking at the photo',
    'Write the bio': 'Writing the bio',
    'Write the roast': 'Writing the roast',
};

type Generation = {
    id: number; image_url: string; cat_name: string; bio: string; location: string | null;
    kind: 'spotted' | 'generated'; neighborhood: string | null; tip: string | null;
};

export default function SpotPage() {
    return (
        <Suspense>
            <Spot />
        </Suspense>
    );
}

function Spot() {
    const supabase = createClient();
    const router = useRouter();
    const params = useSearchParams();
    const tab = params.get('tab') === 'spot' ? 'spot' : 'make';
    // /neighborhoods links here with ?neighborhood= to pre-select a neighborhood.
    const prefill = isNeighborhood(params.get('neighborhood')) ? params.get('neighborhood')! : '';
    const [status, setStatus] = useState<'idle' | 'uploading' | 'generating'>('idle');
    const [error, setError] = useState('');
    const [result, setResult] = useState<Generation | null>(null);
    // Set once "Post it" succeeds; shows the share overlay instead of redirecting straight away.
    const [posted, setPosted] = useState<Generation | null>(null);
    const [steps, setSteps] = useState<StepState[]>([]);
    // What the last request was sent with, so "Roast again" reuses the same neighborhood/vibe or uploaded photo.
    const lastPayload = useRef<object | null>(null);

    // Spot a cat
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState('');
    const [location, setLocation] = useState('');
    const [spotHood, setSpotHood] = useState(prefill);

    // Make a cat
    const [hood, setHood] = useState(prefill);
    const [vibe, setVibe] = useState('');
    const [extra, setExtra] = useState('');

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) router.push('/login');
        });
    }, []);

    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        setPreview(URL.createObjectURL(f));
        setResult(null);
        setError('');
    };

    const callGenerate = async (payload: object) => {
        lastPayload.current = payload;
        setStatus('generating');
        setSteps([]);
        const fail = (message: string) => { setError(message); setStatus('idle'); };

        try {
            const res = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            // Auth and validation errors come back as a plain JSON body with a status code.
            if (!res.ok || !res.body) {
                const json = await res.json().catch(() => ({}));
                return fail(json.error || 'Something went wrong.');
            }

            const onEvent = (event: GenerateEvent): boolean => {
                if ('steps' in event) {
                    setSteps(event.steps.map((name) => ({ name, status: 'pending' })));
                } else if ('step' in event) {
                    setSteps((prev) => prev.map((s) => (s.name === event.step ? { ...s, status: event.status } : s)));
                } else if ('done' in event) {
                    setResult(event.generation);
                    setStatus('idle');
                    return true;
                } else {
                    fail(event.error || 'Something went wrong.');
                    return true;
                }
                return false;
            };

            const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
            let buffer = '';
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += value;
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (line.trim() && onEvent(JSON.parse(line))) return;
                }
            }
            fail('The connection dropped before the cat was ready.');
        } catch {
            fail('Something went wrong.');
        }
    };

    const spot = async () => {
        if (!file) return;
        setError('');
        setStatus('uploading');

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const path = `${user.id}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
        const { error: upErr } = await supabase.storage.from('spots').upload(path, file);
        if (upErr) { setError(upErr.message); setStatus('idle'); return; }

        const { data: pub } = supabase.storage.from('spots').getPublicUrl(path);
        await callGenerate({ imageUrl: pub.publicUrl, location, neighborhood: spotHood || null });
    };

    const make = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!hood || !vibe) return;
        setError('');
        await callGenerate({ kind: 'generated', neighborhood: hood, vibe, extra });
    };

    const reset = () => {
        setPosted(null);
        setFile(null); setPreview(''); setLocation(''); setSpotHood('');
        setHood(''); setVibe(''); setExtra('');
        setResult(null); setError(''); setSteps([]);
        lastPayload.current = null;
    };

    const roastAgain = () => {
        setResult(null);
        if (lastPayload.current) callGenerate(lastPayload.current);
    };

    const busy = status !== 'idle';

    return (
        <main className="center-screen">
            <div className="panel" style={{ width: '100%', maxWidth: 520 }}>
                {result ? (
                    <Preview key={result.id} result={result} onUpdate={setResult} onRoastAgain={roastAgain} onDiscarded={reset} onPosted={setPosted} />
                ) : (
                    <>
                        <nav className="segmented tabs" aria-label="How to add a cat">
                            <Link href="/spot" replace scroll={false} className={`seg${tab === 'make' ? ' active' : ''}`} aria-current={tab === 'make' ? 'page' : undefined}>Make a cat</Link>
                            <Link href="/spot?tab=spot" replace scroll={false} className={`seg${tab === 'spot' ? ' active' : ''}`} aria-current={tab === 'spot' ? 'page' : undefined}>Roast a real cat</Link>
                        </nav>

                        {tab === 'make' ? (
                            <form onSubmit={make}>
                                <h1 className="panel-title">Make a neighborhood cat.</h1>
                                <p className="panel-lede">Pick a neighborhood and a vibe. The AI draws the cat, and the cat roasts the neighborhood.</p>

                                <label className="field">
                                    <span>Neighborhood</span>
                                    <select className="input" value={hood} onChange={(e) => setHood(e.target.value)} required>
                                        <option value="" disabled>Choose a neighborhood</option>
                                        {NEIGHBORHOODS.map((n) => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </label>

                                <label className="field">
                                    <span>Vibe</span>
                                    <select className="input" value={vibe} onChange={(e) => setVibe(e.target.value)} required>
                                        <option value="" disabled>Choose a vibe</option>
                                        {VIBES.map((v) => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                </label>

                                <label className="field">
                                    <span>Anything else? <em className="muted">(optional)</em></span>
                                    <input className="input" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={80} placeholder="Orange tabby, wears a tiny MetroCard" />
                                </label>

                                <GenerationProgress steps={steps} />
                                {error && <p className="error" role="alert">{error}</p>}

                                <button type="submit" disabled={!hood || !vibe || busy} className="btn btn-primary btn-block">
                                    {busy ? 'Making your cat…' : 'Make this cat'}
                                </button>
                            </form>
                        ) : (
                            <>
                                <h1 className="panel-title">Saw a cat? Roast it.</h1>
                                <p className="panel-lede">Upload a photo and the AI will give it a name, a bio and a roast of its neighborhood. The city votes on the funniest ones.</p>

                                <label className="dropzone">
                                    {preview ? <img src={preview} alt="Preview" /> : (
                                        <>
                                            <PawIcon size={40} fill="var(--butter)" stroke="var(--ink)" />
                                            <span>Drop a cat here</span>
                                            <small>or click to choose a photo</small>
                                        </>
                                    )}
                                    <input type="file" accept="image/*" onChange={onFile} aria-label="Cat photo" />
                                </label>

                                <label className="field" style={{ marginTop: '1.1rem' }}>
                                    <span>Neighborhood <em className="muted">(optional)</em></span>
                                    <select className="input" value={spotHood} onChange={(e) => setSpotHood(e.target.value)}>
                                        <option value="">Not sure / somewhere else</option>
                                        {NEIGHBORHOODS.map((n) => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </label>

                                <label className="field">
                                    <span>Where did you see it? <em className="muted">(optional)</em></span>
                                    <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bodega on 110th & Amsterdam" />
                                </label>

                                <GenerationProgress steps={steps} />
                                {error && <p className="error" role="alert">{error}</p>}

                                <button onClick={spot} disabled={!file || busy} className="btn btn-primary btn-block">
                                    {status === 'uploading' ? 'Uploading…' : status === 'generating' ? 'Writing its roast…' : 'Roast this cat'}
                                </button>
                            </>
                        )}
                    </>
                )}
            </div>
            {posted && <PostedOverlay cat={posted} onFeed={() => router.push('/')} onAnother={reset} />}
        </main>
    );
}

type Busy = 'post' | 'save' | 'again' | 'discard' | null;

// Nothing is public yet: the generate route saved this as a draft, and only "Post it" publishes it.
function Preview({ result, onUpdate, onRoastAgain, onDiscarded, onPosted }: {
    result: Generation;
    onUpdate: (g: Generation) => void;
    onRoastAgain: () => void;
    onDiscarded: () => void;
    onPosted: (g: Generation) => void;
}) {
    const made = result.kind === 'generated';
    // Generated images come from an external CDN and can be slow to arrive, so show a placeholder until loaded.
    const [loaded, setLoaded] = useState(!made);
    const [editing, setEditing] = useState(false);
    const [edited, setEdited] = useState(false);
    const [draft, setDraft] = useState({ cat_name: result.cat_name, bio: result.bio, tip: result.tip ?? '' });
    const [busy, setBusy] = useState<Busy>(null);
    const [error, setError] = useState('');
    const [confirming, setConfirming] = useState<'again' | 'discard' | null>(null);

    // Runs a server action with the busy flag; returns whether it succeeded.
    const run = async (kind: Exclude<Busy, null>, action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
        setBusy(kind);
        setError('');
        const res = await action();
        if (!res.ok) { setError(res.error); setBusy(null); }
        return res.ok;
    };

    const post = async () => {
        if (await run('post', () => publishGeneration(result.id))) { onPosted(result); setBusy(null); }
    };
    const save = async () => {
        if (!(await run('save', () => updateGenerationText(result.id, draft)))) return;
        onUpdate({ ...result, cat_name: draft.cat_name.trim(), bio: draft.bio.trim(), tip: draft.tip.trim() });
        setEdited(true);
        setEditing(false);
        setBusy(null);
    };
    // Both go through the confirm dialog first. The dialog closes whether or not the server action worked;
    // a failure shows in the preview's error line.
    const again = async () => {
        const ok = await run('again', () => discardGeneration(result.id));
        setConfirming(null);
        if (ok) onRoastAgain();
    };
    const discard = async () => {
        const ok = await run('discard', () => discardGeneration(result.id));
        setConfirming(null);
        if (ok) onDiscarded();
    };

    const startEdit = () => {
        setDraft({ cat_name: result.cat_name, bio: result.bio, tip: result.tip ?? '' });
        setError('');
        setEditing(true);
    };

    const field = (key: keyof typeof draft) => (
        <p className="edit-count" aria-live="off">{draft[key].length}/{TEXT_LIMITS[key]}</p>
    );

    return (
        <div className="preview">
            <h1 className="panel-title" style={{ marginBottom: '0.4rem' }}>Meet your cat</h1>
            <p className="panel-lede" style={{ marginBottom: '1.5rem' }}>Nobody else can see it until you post it. Edit it, roast again, or throw it away.</p>

            <CatCard
                imageUrl={result.image_url}
                alt={result.cat_name}
                kindTag="Draft"
                clampBio={!editing}
                place={result.neighborhood ?? result.location}
                media={(
                    <>
                        {!loaded && (
                            <div className="photo-print photo-developing">
                                <WalkingPaws label="Developing the photo…" />
                                <span aria-hidden="true">Developing the photo…</span>
                            </div>
                        )}
                        <img src={result.image_url} alt={result.cat_name} style={loaded ? undefined : { display: 'none' }} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
                    </>
                )}
                name={editing ? (
                    <>
                        <input className="edit-name" aria-label="Name" value={draft.cat_name} maxLength={TEXT_LIMITS.cat_name} onChange={(e) => setDraft({ ...draft, cat_name: e.target.value })} />
                        {field('cat_name')}
                    </>
                ) : result.cat_name}
                bio={editing ? (
                    <>
                        <textarea className="edit-text" aria-label="Bio" value={draft.bio} maxLength={TEXT_LIMITS.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
                        {field('bio')}
                    </>
                ) : edited ? result.bio : <TypedBio text={result.bio} />}
                roast={editing ? (
                    <>
                        <textarea className="edit-text" aria-label="The roast" value={draft.tip} maxLength={TEXT_LIMITS.tip} onChange={(e) => setDraft({ ...draft, tip: e.target.value })} />
                        {field('tip')}
                    </>
                ) : result.tip}
            />

            {error && <p className="error" role="alert" style={{ marginTop: '1.25rem', marginBottom: 0 }}>{error}</p>}

            <div className="preview-bar">
                {editing ? (
                    <>
                        <button onClick={save} disabled={busy !== null} className="btn btn-primary">{busy === 'save' ? 'Saving…' : 'Save'}</button>
                        <button onClick={() => { setEditing(false); setError(''); }} disabled={busy !== null} className="btn">Cancel</button>
                    </>
                ) : (
                    <>
                        <button onClick={post} disabled={busy !== null || !loaded} className="btn btn-primary btn-lg">{busy === 'post' ? 'Posting…' : 'Post it'}</button>
                        <button onClick={startEdit} disabled={busy !== null} className="btn">Edit</button>
                        <button onClick={() => setConfirming('again')} disabled={busy !== null} className="btn">{busy === 'again' ? 'Starting over…' : 'Roast again'}</button>
                        <button onClick={() => setConfirming('discard')} disabled={busy !== null} className="btn">Discard</button>
                    </>
                )}
            </div>

            <ConfirmDialog
                open={confirming === 'discard'}
                title="Throw this cat away?"
                body="It will be deleted. Nobody has seen it yet."
                confirmLabel="Throw it away"
                busy={busy === 'discard'}
                onCancel={() => setConfirming(null)}
                onConfirm={discard}
            />
            <ConfirmDialog
                open={confirming === 'again'}
                title="Throw this one away and make another?"
                body="This cat will be deleted and a new one made with the same settings."
                confirmLabel="Throw it away"
                cancelLabel="Keep this one"
                busy={busy === 'again'}
                onCancel={() => setConfirming(null)}
                onConfirm={again}
            />
        </div>
    );
}

// Flyer-style checklist that ticks off each prompt-chain step as the route reports it.
function GenerationProgress({ steps }: { steps: StepState[] }) {
    if (!steps.length) return null;
    return (
        <ol className="progress-card" role="status" aria-label="Progress">
            {steps.map((s) => (
                <li key={s.name} className={`progress-step ${s.status}`}>
                    <span className="progress-box" aria-hidden="true">{s.status === 'done' ? '✓' : s.status === 'failed' ? '✕' : ''}</span>
                    <span>{STEP_LABELS[s.name] ?? s.name}</span>
                    <span className="sr-only">{s.status === 'done' ? ' (done)' : s.status === 'failed' ? ' (failed)' : s.status === 'running' ? ' (in progress)' : ''}</span>
                </li>
            ))}
        </ol>
    );
}

function WalkingPaws({ label = 'Writing its story…' }: { label?: string }) {
    return (
        <span className="walking-paws" role="status">
            <span className="sr-only">{label}</span>
            {[1, 2, 3].map((i) => <PawIcon key={i} size={18} className={`walk-paw walk-paw-${i}`} />)}
        </span>
    );
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Types the bio out at ~25ms per character, capped at 3s total. Reduced motion shows it all at once.
function TypedBio({ text }: { text: string }) {
    const [count, setCount] = useState(() => (reducedMotion() ? text.length : 0));

    useEffect(() => {
        if (reducedMotion()) return;
        const perChar = Math.min(25, 3000 / Math.max(text.length, 1));
        const start = performance.now();
        const id = setInterval(() => {
            const n = Math.min(text.length, Math.floor((performance.now() - start) / perChar) + 1);
            setCount(n);
            if (n >= text.length) clearInterval(id);
        }, Math.max(perChar, 16));
        return () => clearInterval(id);
    }, [text]);

    return (
        <p style={{ lineHeight: 1.55, margin: 0 }}>
            <span className="sr-only">{text}</span>
            <span aria-hidden="true">
                {text.slice(0, count)}
                {count < text.length && <span className="type-cursor" />}
            </span>
        </p>
    );
}
