'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';

type Props = {
    userId: string;
    email: string | null;
    firstName: string;
    lastName: string;
    avatarUrl: string;
    // /dashboard?setup=1 (new sign-ups): scroll to the card, highlight it and focus the first empty field.
    setup: boolean;
};

// "Your profile" on the dashboard: everything /profile used to do. Saving refreshes the page in place.
export default function ProfileCard({ userId, email, firstName: initialFirst, lastName: initialLast, avatarUrl: initialAvatar, setup }: Props) {
    const supabase = createClient();
    const router = useRouter();
    const cardRef = useRef<HTMLElement>(null);
    const firstRef = useRef<HTMLInputElement>(null);
    const lastRef = useRef<HTMLInputElement>(null);
    const [firstName, setFirstName] = useState(initialFirst);
    const [lastName, setLastName] = useState(initialLast);
    const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [highlight, setHighlight] = useState(setup);

    useEffect(() => {
        if (!setup) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        cardRef.current?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        (initialFirst ? lastRef : firstRef).current?.focus({ preventScroll: true });
    }, [setup, initialFirst]);

    const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setError('');
        const path = `${userId}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, file);
        if (upErr) setError(upErr.message);
        else setAvatarUrl(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl);
        setUploading(false);
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        const { error: saveErr } = await supabase
            .from('profiles')
            .update({ first_name: firstName.trim(), last_name: lastName.trim(), avatar_url: avatarUrl })
            .eq('id', userId);
        setSaving(false);
        if (saveErr) { setError(saveErr.message); return; }
        setSaved(true);
        setHighlight(false);
        setTimeout(() => setSaved(false), 2500);
        // Drop ?setup=1 and re-read the server-rendered parts (the feed badge, the stats) with the new name.
        router.replace('/dashboard', { scroll: false });
        router.refresh();
    };

    const name = [firstName, lastName].filter(Boolean).join(' ');

    return (
        <section ref={cardRef} id="profile" className={`panel profile-card${highlight ? ' profile-highlight' : ''}`} aria-labelledby="profile-title">
            <div className="profile-head">
                <div className="avatar">
                    {avatarUrl ? <img src={avatarUrl} alt={name || 'Your photo'} /> : 'No photo'}
                </div>
                <div className="profile-id">
                    <h1 id="profile-title" className="profile-title">Your profile</h1>
                    <p className="muted profile-email">{email}</p>
                    {setup && highlight && <p className="profile-setup">Welcome! Add your name so your cats have a poster.</p>}
                </div>
                <Link href="/spot" className="btn btn-primary profile-make">Make a cat</Link>
            </div>

            <form className="profile-form" onSubmit={save}>
                <label className="field">
                    <span>First name</span>
                    <input ref={firstRef} className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" autoComplete="given-name" />
                </label>
                <label className="field">
                    <span>Last name</span>
                    <input ref={lastRef} className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" autoComplete="family-name" />
                </label>
                <label className="btn profile-upload">
                    {uploading ? 'Uploading…' : 'Upload photo'}
                    <input type="file" accept="image/*" onChange={upload} disabled={uploading} className="sr-only" />
                </label>
                <button type="submit" disabled={saving || uploading || !firstName.trim() || !lastName.trim()} className="btn btn-primary profile-save">
                    {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save'}
                </button>
            </form>
            {error && <p className="error" role="alert" style={{ margin: '1rem 0 0' }}>{error}</p>}
            <p className="sr-only" role="status">{saved ? 'Profile saved' : ''}</p>
        </section>
    );
}
