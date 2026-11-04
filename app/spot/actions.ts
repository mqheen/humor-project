'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/app/lib/supabase/server';
import { TEXT_LIMITS } from '@/app/lib/nyc';

type Result = { ok: true } | { ok: false; error: string };

// Server actions are public POST endpoints, so every one re-checks who is calling and who owns the row.
type Owned = { ok: false; error: string } | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string };

async function ownedBy(id: number): Promise<Owned> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'You must be signed in.' };
    if (!Number.isInteger(id)) return { ok: false, error: 'Unknown cat.' };

    const { data } = await supabase.from('generations').select('id').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (!data) return { ok: false, error: 'That cat isn’t yours.' };
    return { ok: true, supabase, userId: user.id };
}

function refresh() {
    for (const path of ['/', '/dashboard', '/profile', '/neighborhoods']) revalidatePath(path);
}

// created_at moves to the moment of posting so a draft finished days later still lands at the top of New.
export async function publishGeneration(id: number): Promise<Result> {
    const owner = await ownedBy(id);
    if (!owner.ok) return owner;
    const { error } = await owner.supabase
        .from('generations')
        .update({ is_published: true, created_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', owner.userId);
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
}

export async function updateGenerationText(id: number, text: { cat_name: string; bio: string; tip: string }): Promise<Result> {
    const owner = await ownedBy(id);
    if (!owner.ok) return owner;

    const next = { cat_name: text.cat_name?.trim() ?? '', bio: text.bio?.trim() ?? '', tip: text.tip?.trim() ?? '' };
    const names = { cat_name: 'Name', bio: 'Bio', tip: 'Roast' };
    for (const key of Object.keys(TEXT_LIMITS) as (keyof typeof TEXT_LIMITS)[]) {
        if (!next[key]) return { ok: false, error: `${names[key]} can’t be empty.` };
        if (next[key].length > TEXT_LIMITS[key]) return { ok: false, error: `${names[key]} is ${next[key].length} characters; the limit is ${TEXT_LIMITS[key]}.` };
    }

    const { error } = await owner.supabase.from('generations').update(next).eq('id', id).eq('user_id', owner.userId);
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
}

// Votes cascade. generation_requests keeps its log: its generation_id FK is ON DELETE SET NULL.
export async function discardGeneration(id: number): Promise<Result> {
    const owner = await ownedBy(id);
    if (!owner.ok) return owner;
    const { error } = await owner.supabase.from('generations').delete().eq('id', id).eq('user_id', owner.userId);
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
}
