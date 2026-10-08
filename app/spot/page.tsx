'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';

type Generation = { id: number; image_url: string; cat_name: string; bio: string; location: string | null };

export default function SpotPage() {
    const supabase = createClient();
    const router = useRouter();
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState('');
    const [location, setLocation] = useState('');
    const [status, setStatus] = useState<'idle' | 'uploading' | 'generating'>('idle');
    const [error, setError] = useState('');
    const [result, setResult] = useState<Generation | null>(null);

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

    const generate = async () => {
        if (!file) return;
        setError('');
        setStatus('uploading');

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const path = `${user.id}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
        const { error: upErr } = await supabase.storage.from('spots').upload(path, file);
        if (upErr) { setError(upErr.message); setStatus('idle'); return; }

        const { data: pub } = supabase.storage.from('spots').getPublicUrl(path);

        setStatus('generating');
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: pub.publicUrl, location }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Something went wrong.'); setStatus('idle'); return; }

        setResult(json);
        setStatus('idle');
    };

    const reset = () => {
        setFile(null); setPreview(''); setLocation(''); setResult(null); setError('');
    };

    return (
        <main className="center-screen">
            <div className="panel" style={{ width: '100%', maxWidth: 520 }}>
                {!result ? (
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
                            <span>Where did you see it? <em className="muted">(optional)</em></span>
                            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bodega on 110th & Amsterdam" />
                        </label>

                        {error && <p className="error" role="alert">{error}</p>}

                        <button onClick={generate} disabled={!file || status !== 'idle'} className="btn btn-primary btn-block">
                            {status === 'uploading' ? 'Uploading…' : status === 'generating' ? <WalkingPaws /> : 'Generate bio'}
                        </button>
                    </>
                ) : (
                    <>
                        <h1 className="panel-title" style={{ marginBottom: '1rem' }}>Meet {result.cat_name}</h1>
                        <img src={result.image_url} alt={result.cat_name} className="photo-print" />
                        {result.location && <p style={{ margin: '0 0 0.75rem' }}><span className="sticker">{result.location}</span></p>}
                        <TypedBio key={result.id} text={result.bio} />
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <Link href="/" className="btn btn-primary" style={{ flex: 1 }}>See it on the feed</Link>
                            <button onClick={reset} className="btn" style={{ flex: 1 }}>Post another</button>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}

function PawIcon({ size, className, fill, stroke }: { size: number; className?: string; fill?: string; stroke?: string }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={fill} stroke={stroke} strokeWidth={stroke ? 1.4 : undefined}>
            <ellipse cx="12" cy="16.5" rx="5" ry="4.2" />
            <ellipse cx="5.2" cy="10.6" rx="2" ry="2.5" />
            <ellipse cx="9.4" cy="5.8" rx="2.1" ry="2.6" />
            <ellipse cx="14.6" cy="5.8" rx="2.1" ry="2.6" />
            <ellipse cx="18.8" cy="10.6" rx="2" ry="2.5" />
        </svg>
    );
}

function WalkingPaws() {
    return (
        <span className="walking-paws" role="status">
            <span className="sr-only">Writing its story…</span>
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
        <p style={{ lineHeight: 1.55, margin: '0 0 1.5rem' }}>
            <span className="sr-only">{text}</span>
            <span aria-hidden="true">
                {text.slice(0, count)}
                {count < text.length && <span className="type-cursor" />}
            </span>
        </p>
    );
}
