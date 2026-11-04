'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { NEIGHBORHOODS, VIBES } from '@/app/lib/nyc';
import PawIcon from '@/app/components/PawIcon';
import CatTip from '@/app/components/CatTip';

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
    'Write the tip': 'Writing the tip',
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
    const tab = useSearchParams().get('tab') === 'spot' ? 'spot' : 'make';
    const [status, setStatus] = useState<'idle' | 'uploading' | 'generating'>('idle');
    const [error, setError] = useState('');
    const [result, setResult] = useState<Generation | null>(null);
    const [steps, setSteps] = useState<StepState[]>([]);

    // Spot a cat
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState('');
    const [location, setLocation] = useState('');
    const [spotHood, setSpotHood] = useState('');

    // Make a cat
    const [hood, setHood] = useState('');
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
        setFile(null); setPreview(''); setLocation(''); setSpotHood('');
        setExtra('');
        setResult(null); setError(''); setSteps([]);
    };

    const busy = status !== 'idle';

    return (
        <main className="center-screen">
            <div className="panel" style={{ width: '100%', maxWidth: 520 }}>
                {result ? (
                    <Result result={result} onReset={reset} />
                ) : (
                    <>
                        <nav className="segmented tabs" aria-label="How to add a cat">
                            <Link href="/spot" replace scroll={false} className={`seg${tab === 'make' ? ' active' : ''}`} aria-current={tab === 'make' ? 'page' : undefined}>Make a cat</Link>
                            <Link href="/spot?tab=spot" replace scroll={false} className={`seg${tab === 'spot' ? ' active' : ''}`} aria-current={tab === 'spot' ? 'page' : undefined}>Spot a cat</Link>
                        </nav>

                        {tab === 'make' ? (
                            <form onSubmit={make}>
                                <h1 className="panel-title">Make a neighborhood cat.</h1>
                                <p className="panel-lede">Pick a neighborhood and a vibe. The AI draws the cat and it tells you where to go.</p>

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
                                <h1 className="panel-title">Saw a cat? Post it.</h1>
                                <p className="panel-lede">Upload a photo and the AI will give it a name and a New York backstory. The city votes on the best ones.</p>

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
                                    {status === 'uploading' ? 'Uploading…' : status === 'generating' ? 'Writing its story…' : 'Generate bio'}
                                </button>
                            </>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}

function Result({ result, onReset }: { result: Generation; onReset: () => void }) {
    const made = result.kind === 'generated';
    // Generated images come from an external CDN and can be slow to arrive, so show a placeholder until loaded.
    const [loaded, setLoaded] = useState(!made);
    const sticker = result.neighborhood ? `${made ? 'Made' : 'Spotted'} in ${result.neighborhood}` : result.location;

    return (
        <>
            <h1 className="panel-title" style={{ marginBottom: '1rem' }}>Meet {result.cat_name}</h1>
            {!loaded && (
                <div className="photo-print photo-developing">
                    <WalkingPaws label="Developing the photo…" />
                    <span aria-hidden="true">Developing the photo…</span>
                </div>
            )}
            <img src={result.image_url} alt={result.cat_name} className="photo-print" style={loaded ? undefined : { display: 'none' }} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
            {sticker && <p style={{ margin: '0 0 0.75rem' }}><span className="sticker">{sticker}</span></p>}
            <TypedBio key={result.id} text={result.bio} />
            {result.tip && <CatTip tip={result.tip} />}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                <Link href="/" className="btn btn-primary" style={{ flex: 1 }}>See it on the feed</Link>
                <button onClick={onReset} className="btn" style={{ flex: 1 }}>Post another</button>
            </div>
        </>
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
        <p style={{ lineHeight: 1.55, margin: '0 0 1rem' }}>
            <span className="sr-only">{text}</span>
            <span aria-hidden="true">
                {text.slice(0, count)}
                {count < text.length && <span className="type-cursor" />}
            </span>
        </p>
    );
}
