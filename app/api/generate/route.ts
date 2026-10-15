import { createClient } from '@/app/lib/supabase/server';
import { NextResponse } from 'next/server';
import { NEIGHBORHOOD_FACTS, isNeighborhood, isVibe } from '@/app/lib/nyc';

const MODEL = 'qwen/qwen3.8-27b';

const SPOTTED_INTRO = `You are writing a profile for a cat that someone spotted in New York City.
Look at the photo and make the profile specific to what you can actually see (color, pose, setting, expression).`;

// Shared by both branches: every cat is a local guide for its neighborhood.
function profileRules(place: string, vibe?: string) {
    const facts = place in NEIGHBORHOOD_FACTS ? NEIGHBORHOOD_FACTS[place as keyof typeof NEIGHBORHOOD_FACTS] : null;
    return `Every cat on this site is a local guide for its neighborhood.
${facts ? `Verified facts about ${place}: ${facts}
Base every specific claim (street, train line, park, food) on these facts. Do not invent street names, train lines or businesses. If unsure, leave it out.
` : ''}
Return ONLY a JSON object in this exact shape: {"name": "...", "bio": "...", "tip": "..."}
- name: a cat name.
- bio: 2-3 sentences written as a lifelong resident of ${place}${vibe ? `, in the "${vibe}" vibe` : ''}. Mention one real, specific thing about ${place}: a street, park, train line, or known food.
- tip: one concrete, useful recommendation for a first-time visitor to ${place}: what to eat, where to sit, which train, when to go, or what to skip. It must be real and accurate. Prefer landmarks, parks, train lines and food types over business names. NEVER invent a store or restaurant name. Under 160 characters, in the cat's voice.
Keep it warm, not mean. No hashtags, no emojis.`;
}

type Parsed = { name?: string; bio?: string; tip?: string };

// Keep tips under 160 characters: whole sentences if they fit, otherwise cut at a word.
function fitTip(tip: string, max = 160) {
    tip = tip.trim();
    if (tip.length <= max) return tip;
    let out = '';
    for (const sentence of tip.match(/[^.!?]+[.!?]+/g) ?? []) {
        if ((out + sentence).trim().length > max) break;
        out += sentence;
    }
    if (out.trim()) return out.trim();
    return tip.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

type Content = string | { type: string; text?: string; image_url?: { url: string } }[];
type Result<T> = ({ ok: true } & T) | { ok: false; detail: string };

async function askGroq(apiKey: string, content: Content): Promise<Result<{ text: string }>> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: MODEL,
            temperature: 0.9,
            max_completion_tokens: 500,
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content }],
        }),
    });
    if (!res.ok) return { ok: false, detail: await res.text() };
    const json = await res.json();
    return { ok: true, text: json?.choices?.[0]?.message?.content ?? '' };
}

async function makeImage(falKey: string, prompt: string): Promise<Result<{ url: string }>> {
    const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, image_size: 'landscape_4_3', num_images: 1, num_inference_steps: 4, enable_safety_checker: true }),
    });
    const raw = await res.text();
    if (!res.ok) return { ok: false, detail: raw };
    let url: unknown;
    try { url = JSON.parse(raw)?.images?.[0]?.url; } catch { /* fall through */ }
    return typeof url === 'string' ? { ok: true, url } : { ok: false, detail: raw };
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'GROQ_API_KEY is not set.' }, { status: 500 });
    }

    const body = await request.json();
    const kind: 'spotted' | 'generated' = body.kind === 'generated' ? 'generated' : 'spotted';
    const neighborhood = isNeighborhood(body.neighborhood) ? body.neighborhood : null;

    let location: string | null;
    let fullPrompt: string;
    let imagePrompt: string | null = null;
    let imageUrl: string;
    let text: string;

    if (kind === 'generated') {
        if (!neighborhood) {
            return NextResponse.json({ error: 'Pick a neighborhood.' }, { status: 400 });
        }
        if (!isVibe(body.vibe)) {
            return NextResponse.json({ error: 'Pick a vibe.' }, { status: 400 });
        }
        const falKey = process.env.FAL_KEY;
        if (!falKey) {
            return NextResponse.json({ error: 'FAL_KEY is not set.' }, { status: 500 });
        }
        const vibe: string = body.vibe;
        const extra = typeof body.extra === 'string' ? body.extra.trim().slice(0, 80) : '';

        imagePrompt = `A candid photo of a cat in ${neighborhood}, New York City. ${vibe} vibe. ${extra ? `${extra}. ` : ''}Natural light, street photography, shallow depth of field, no text, no watermark.`;
        location = neighborhood;
        fullPrompt = `You are writing a profile for an AI-made cat that lives in ${neighborhood}, New York City. Its vibe: ${vibe}.`
            + (extra ? `\nExtra detail from the person who made it: ${extra}` : '')
            + `\n\n${profileRules(neighborhood, vibe)}`;

        // Image and text don't depend on each other, so run them together.
        const [image, groq] = await Promise.all([makeImage(falKey, imagePrompt), askGroq(apiKey, fullPrompt)]);
        if (!image.ok) {
            return NextResponse.json({ error: 'Image generation failed.', detail: image.detail }, { status: 502 });
        }
        if (!groq.ok) {
            return NextResponse.json({ error: 'AI request failed.', detail: groq.detail }, { status: 502 });
        }
        imageUrl = image.url;
        text = groq.text;
    } else {
        if (!body.imageUrl) {
            return NextResponse.json({ error: 'imageUrl is required.' }, { status: 400 });
        }
        imageUrl = body.imageUrl;
        location = body.location || null;

        fullPrompt = `${SPOTTED_INTRO}\n\n${profileRules(neighborhood ?? 'New York City')}`
            + (location ? `\n\nWhere it was spotted: ${location}` : '');
        const groq = await askGroq(apiKey, [
            { type: 'text', text: fullPrompt },
            { type: 'image_url', image_url: { url: imageUrl } },
        ]);
        if (!groq.ok) {
            return NextResponse.json({ error: 'AI request failed.', detail: groq.detail }, { status: 502 });
        }
        text = groq.text;
    }

    let parsed: Parsed = {};
    try {
        parsed = JSON.parse(text);
    } catch {
        return NextResponse.json({ error: 'Could not parse AI response.', raw: text }, { status: 502 });
    }

    if (!parsed.name || !parsed.bio || !parsed.tip) {
        return NextResponse.json({ error: 'AI response was incomplete.', raw: text }, { status: 502 });
    }

    const { data, error } = await supabase
        .from('generations')
        .insert({
            user_id: user.id,
            image_url: imageUrl,
            kind,
            neighborhood,
            location,
            prompt: fullPrompt,
            image_prompt: imagePrompt,
            model: MODEL,
            cat_name: parsed.name,
            bio: parsed.bio,
            tip: fitTip(parsed.tip),
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Posting counts as activity for the daily streak. Best effort: errors are ignored.
    await supabase.rpc('touch_streak');

    return NextResponse.json(data);
}
