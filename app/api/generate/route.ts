import { createClient } from '@/app/lib/supabase/server';
import { NextResponse } from 'next/server';
import { NEIGHBORHOOD_FACTS, TEXT_LIMITS, isNeighborhood, isVibe } from '@/app/lib/nyc';
import { chat, describeMessages, fitText, loadMix, loadSteps, makeImage, makeResponseLogger, runSteps, type Message } from '@/app/lib/pipeline';

// Fallback pipeline: used only when the mix or its steps can't be loaded from the database.
const FALLBACK_MODEL = 'qwen/qwen3.8-27b';
const FALLBACK_IMAGE_MODEL = 'fal-ai/flux/schnell';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const FAL_BASE_URL = 'https://fal.run';

const SPOTTED_INTRO = `You are writing a profile for a cat that someone spotted in New York City.
Look at the photo and make the profile specific to what you can actually see (color, pose, setting, expression).`;

// Shared by both branches: every cat has opinions about its neighborhood.
function profileRules(place: string, vibe?: string) {
    const facts = place in NEIGHBORHOOD_FACTS ? NEIGHBORHOOD_FACTS[place as keyof typeof NEIGHBORHOOD_FACTS] : null;
    return `Every cat on this site is a lifelong resident with strong opinions about its neighborhood.
${facts ? `Verified facts about ${place}: ${facts}
Base every specific claim (street, train line, park, food) on these facts. Do not invent street names, train lines or businesses. If unsure, leave it out.
` : ''}
Return ONLY a JSON object in this exact shape: {"name": "...", "bio": "...", "roast": "..."}
- name: a cat name.
- bio: one sentence, under 20 words, written as a lifelong resident of ${place}${vibe ? `, in the "${vibe}" vibe` : ''}. Mention one real, specific thing about ${place}: a street, park, train line, or known food.
- roast: one funny roast of ${place} itself, in the cat's voice: its trains, rent, crowds, weather, food or habits. Punch at the neighborhood, never at people or groups. It must rest on real, accurate details. Prefer landmarks, parks, train lines and food types over business names. NEVER invent a store or restaurant name. Under 200 characters.
Affectionate, not cruel. No hashtags, no emojis.`;
}

// Events written to the response, one JSON object per line.
type StreamEvent =
    | { steps: string[] }
    | { step: string; status: 'running' | 'done' | 'failed' }
    | { done: true; generation: unknown }
    | { error: string; detail?: string; raw?: string; status: number };

// Step names used when the chain can't be loaded; they match the seeded chain's names.
const IMAGE_STEP = 'Draw the cat';
const BIO_STEP = 'Write the bio';
const ROAST_STEP = 'Write the roast';

type Parsed = { name?: string; bio?: string; roast?: string };

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await request.json();
    const kind: 'spotted' | 'generated' = body.kind === 'generated' ? 'generated' : 'spotted';
    const neighborhood = isNeighborhood(body.neighborhood) ? body.neighborhood : null;
    const vibe: string | null = kind === 'generated' && isVibe(body.vibe) ? body.vibe : null;
    const extra = kind === 'generated' && typeof body.extra === 'string' ? body.extra.trim().slice(0, 80) : '';
    const inputImageUrl: string | null = kind === 'spotted' && typeof body.imageUrl === 'string' && body.imageUrl ? body.imageUrl : null;
    const location: string | null = kind === 'generated' ? neighborhood : (body.location || null);

    if (kind === 'generated') {
        if (!neighborhood) return NextResponse.json({ error: 'Pick a neighborhood.' }, { status: 400 });
        if (!vibe) return NextResponse.json({ error: 'Pick a vibe.' }, { status: 400 });
    } else if (!inputImageUrl) {
        return NextResponse.json({ error: 'imageUrl is required.' }, { status: 400 });
    }

    // Load the mix (with its chains, steps, models and providers) before logging so the request row gets mix_id.
    const mix = await loadMix(supabase, kind);

    const startedAt = Date.now();
    // Logging is best effort: if the request row can't be written, generation still runs.
    const { data: requestRow } = await supabase
        .from('generation_requests')
        .insert({
            user_id: user.id,
            kind,
            mix_id: mix?.id ?? null,
            inputs: { neighborhood, vibe, image_url: inputImageUrl },
            status: 'running',
        })
        .select('id')
        .single();
    const requestId: number | null = requestRow?.id ?? null;

    const logResponse = makeResponseLogger(supabase, requestId);

    const finish = async (patch: { status: 'succeeded' | 'failed'; error?: string; generation_id?: number }) => {
        if (!requestId) return;
        await supabase
            .from('generation_requests')
            .update({ ...patch, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt })
            .eq('id', requestId);
    };

    const encoder = new TextEncoder();
    const fallbackSteps = kind === 'generated' ? [IMAGE_STEP, BIO_STEP, ROAST_STEP] : [BIO_STEP, ROAST_STEP];

    // Validation errors above are plain JSON with a status. Once the stream starts the status is
    // already 200, so failures from here on arrive as a final {error} event instead.
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            // The client may have gone away; generation and logging still run to completion.
            const send = (event: StreamEvent) => {
                try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { /* stream closed */ }
            };
            const running = new Set<string>();
            const begin = (step: string) => { running.add(step); send({ step, status: 'running' }); };
            const complete = (step: string) => { running.delete(step); send({ step, status: 'done' }); };

            const fail = async (status: number, payload: { error: string; detail?: string; raw?: string }) => {
                await finish({ status: 'failed', error: payload.detail ? `${payload.error} ${payload.detail}`.slice(0, 4000) : payload.error });
                for (const step of running) send({ step, status: 'failed' });
                running.clear();
                send({ ...payload, status });
            };

        try {
            const steps = await loadSteps(mix);
            send({ steps: steps ? steps.map(s => s.name) : fallbackSteps });
            let parsed: Parsed;
            let imageUrl: string;
            let fullPrompt: string;
            let imagePrompt: string | null = null;
            let model: string;

            if (steps) {
                const run = await runSteps(supabase, steps, { neighborhood, vibe, location, inputImageUrl, extra }, { begin, complete, log: logResponse });
                if (!run.ok) return await fail(run.status, { error: run.error, detail: run.detail, raw: run.raw });
                const { outputs, textPrompts, textModel } = run;
                imagePrompt = run.imagePrompt;

                const finalImage = kind === 'generated' ? outputs.image_url : inputImageUrl;
                if (!finalImage) return await fail(502, { error: 'Image generation failed.', detail: 'No image step produced an image.' });
                // The chain's roast step still has output_key 'tip' (it feeds the generations.tip column).
                parsed = { name: outputs.name, bio: outputs.bio, roast: outputs.tip };
                imageUrl = finalImage;
                fullPrompt = textPrompts.join('\n\n---\n\n');
                model = textModel ?? steps.find(s => s.llm_models.kind !== 'image')?.llm_models.model_id ?? FALLBACK_MODEL;
            } else {
                // Fallback: the original hardcoded prompts, still logged against the request.
                const apiKey = process.env.GROQ_API_KEY;
                if (!apiKey) return await fail(500, { error: 'GROQ_API_KEY is not set.' });
                model = FALLBACK_MODEL;
                let text: string;

                if (kind === 'generated') {
                    const falKey = process.env.FAL_KEY;
                    if (!falKey) return await fail(500, { error: 'FAL_KEY is not set.' });

                    imagePrompt = `A candid photo of a cat in ${neighborhood}, New York City. ${vibe} vibe. ${extra ? `${extra}. ` : ''}Natural light, street photography, shallow depth of field, no text, no watermark.`;
                    fullPrompt = `You are writing a profile for an AI-made cat that lives in ${neighborhood}, New York City. Its vibe: ${vibe}.`
                        + (extra ? `\nExtra detail from the person who made it: ${extra}` : '')
                        + `\n\n${profileRules(neighborhood!, vibe!)}`;

                    // Image and text don't depend on each other, so run them together.
                    begin(IMAGE_STEP);
                    begin(BIO_STEP);
                    begin(ROAST_STEP);
                    const messages: Message[] = [{ role: 'user', content: fullPrompt }];
                    const [image, groq] = await Promise.all([
                        makeImage(FAL_BASE_URL, falKey, FALLBACK_IMAGE_MODEL, imagePrompt),
                        chat(GROQ_BASE_URL, apiKey, FALLBACK_MODEL, messages, { temperature: 0.9, maxTokens: 500, json: true }),
                    ]);
                    await logResponse({ stepId: null, modelId: null, promptSent: imagePrompt, call: image, text: image.ok ? image.url : undefined });
                    await logResponse({ stepId: null, modelId: null, promptSent: describeMessages(messages), temperature: 0.9, call: groq, text: groq.ok ? groq.text : undefined, usage: groq.ok ? groq.usage : undefined });
                    if (image.ok) complete(IMAGE_STEP);
                    if (!image.ok) return await fail(502, { error: 'Image generation failed.', detail: image.detail });
                    if (!groq.ok) return await fail(502, { error: 'AI request failed.', detail: groq.detail });
                    imageUrl = image.url;
                    text = groq.text;
                } else {
                    imageUrl = inputImageUrl!;
                    begin(BIO_STEP);
                    begin(ROAST_STEP);
                    fullPrompt = `${SPOTTED_INTRO}\n\n${profileRules(neighborhood ?? 'New York City')}`
                        + (location ? `\n\nWhere it was spotted: ${location}` : '');
                    const messages: Message[] = [{
                        role: 'user',
                        content: [
                            { type: 'text', text: fullPrompt },
                            { type: 'image_url', image_url: { url: imageUrl } },
                        ],
                    }];
                    const groq = await chat(GROQ_BASE_URL, apiKey, FALLBACK_MODEL, messages, { temperature: 0.9, maxTokens: 500, json: true });
                    await logResponse({ stepId: null, modelId: null, promptSent: describeMessages(messages), temperature: 0.9, call: groq, text: groq.ok ? groq.text : undefined, usage: groq.ok ? groq.usage : undefined });
                    if (!groq.ok) return await fail(502, { error: 'AI request failed.', detail: groq.detail });
                    text = groq.text;
                }

                try {
                    parsed = JSON.parse(text);
                } catch {
                    return await fail(502, { error: 'Could not parse AI response.', raw: text });
                }
                complete(BIO_STEP);
                complete(ROAST_STEP);
            }

            if (!parsed.name || !parsed.bio || !parsed.roast) {
                return await fail(502, { error: 'AI response was incomplete.', raw: JSON.stringify(parsed) });
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
                    model,
                    cat_name: parsed.name,
                    bio: fitText(parsed.bio, TEXT_LIMITS.bio),
                    tip: fitText(parsed.roast, TEXT_LIMITS.tip),
                    // Drafts stay private to their owner until they hit "Post it" in the preview.
                    is_published: false,
                })
                .select()
                .single();

            if (error) {
                return await fail(500, { error: error.message });
            }

            await finish({ status: 'succeeded', generation_id: data.id });

            // Posting counts as activity for the daily streak. Best effort: errors are ignored.
            await supabase.rpc('touch_streak');

            send({ done: true, generation: data });
        } catch (err) {
            return await fail(500, { error: 'Something went wrong.', detail: err instanceof Error ? err.message : String(err) });
        } finally {
            controller.close();
        }
        },
    });

    return new Response(stream, {
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' },
    });
}
