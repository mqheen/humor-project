'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
    const supabase = createClient();
    const router = useRouter();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push('/login'); return; }
            const { data: profile } = await supabase
                .from('profiles')
                .select('first_name, last_name, avatar_url')
                .eq('id', user.id)
                .single();
            if (profile) {
                setFirstName(profile.first_name || '');
                setLastName(profile.last_name || '');
                setAvatarUrl(profile.avatar_url || '');
            }
            setLoading(false);
        };
        load();
    }, []);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const filePath = `${user.id}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from('avatars').upload(filePath, file);
        if (!error) {
            const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
            setAvatarUrl(data.publicUrl);
        }
        setUploading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase
            .from('profiles')
            .update({ first_name: firstName, last_name: lastName, avatar_url: avatarUrl })
            .eq('id', user.id);
        setSaving(false);
        setSaved(true);
        setTimeout(() => router.push('/'), 600);
    };

    if (loading) return <main className="center-screen"><p className="muted">Loading…</p></main>;

    return (
        <main className="center-screen">
            <div className="panel" style={{ width: '100%', maxWidth: 440 }}>
                <p className="eyebrow">Your profile</p>
                <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.75rem', letterSpacing: '-0.02em' }}>Tell us about you</h1>
                <p className="muted" style={{ margin: '0 0 1.75rem' }}>Your name and photo show up on your dashboard.</p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', marginBottom: '1.75rem' }}>
                    <div className="avatar">
                        {avatarUrl ? <img src={avatarUrl} alt="Avatar" /> : 'No photo'}
                    </div>
                    <label className="btn" style={{ cursor: 'pointer' }}>
                        {uploading ? 'Uploading…' : 'Upload photo'}
                        <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} style={{ display: 'none' }} />
                    </label>
                </div>

                <label className="field">
                    <span>First name</span>
                    <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
                </label>
                <label className="field">
                    <span>Last name</span>
                    <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
                </label>

                <button onClick={handleSave} disabled={saving || !firstName || !lastName} className="btn btn-primary btn-block" style={{ marginTop: '0.5rem' }}>
                    {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save and continue'}
                </button>
            </div>
        </main>
    );
}