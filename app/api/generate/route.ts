import { createClient } from '@/app/lib/supabase/server';
import { NextResponse } from 'next/server';

const MODEL = 'qwen/qwen3.8-27b';

const PROMPT = `You are writing a profile for a cat that someone spotted in New York City.
Look at the photo and give this cat a name and a short, witty bio (2-3 sentences) as if the cat were a lifelong New Yorker.
Make the bio specific to what you can actually see in the photo (color, pose, setting, expression).
If a location is provided, work it in naturally. Keep it warm, not mean. No hashtags, no emojis.
Return ONLY a JSON object in this exact shape: {"name": "...", "bio": "..."}`;

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

    const { imageUrl, location } = await request.json();
    if (!imageUrl) {
        return NextResponse.json({ error: 'imageUrl is required.' }, { status: 400 });
    }

    const fullPrompt = location ? `${PROMPT}\n\nLocation: ${location}` : PROMPT;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: MODEL,
            temperature: 0.9,
            max_completion_tokens: 400,
            response_format: { type: 'json_object' },
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: fullPrompt },
                    { type: 'image_url', image_url: { url: imageUrl } },
                ],
            }],
        }),
    });

    if (!res.ok) {
        const detail = await res.text();
        return NextResponse.json({ error: 'AI request failed.', detail }, { status: 502 });
    }

    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? '';

    let parsed: { name?: string; bio?: string } = {};
    try {
        parsed = JSON.parse(text);
    } catch {
        return NextResponse.json({ error: 'Could not parse AI response.', raw: text }, { status: 502 });
    }

    if (!parsed.name || !parsed.bio) {
        return NextResponse.json({ error: 'AI response was incomplete.', raw: text }, { status: 502 });
    }

    const { data, error } = await supabase
        .from('generations')
        .insert({
            user_id: user.id,
            image_url: imageUrl,
            location: location || null,
            prompt: fullPrompt,
            model: MODEL,
            cat_name: parsed.name,
            bio: parsed.bio,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}