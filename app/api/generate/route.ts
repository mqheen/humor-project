import { createClient } from '@/app/lib/supabase/server';
import { NextResponse } from 'next/server';
import { NEIGHBORHOOD_FACTS, isNeighborhood, isVibe } from '@/app/lib/nyc';

type Supabase = Awaited<ReturnType<typeof createClient>>;

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
- bio: 2-3 sentences written as a lifelong resident of ${place}${vibe ? `, in the "${vibe}" vibe` : ''}. Mention one real, specific thing about ${place}: a street, park, train line, or known food.
- roast: one funny roast of ${place} itself, in the cat's voice: its trains, rent, crowds, weather, food or habits. Punch at the neighborhood, never at people or groups. It must rest on real, accurate details. Prefer landmarks, parks, train lines and food types over business names. NEVER invent a store or restaurant name. Under 160 characters.
Affectionate, not cruel. No hashtags, no emojis.`;
}

// The bio step's template asks for "your name and a bio" in prose; this pins the shape so
// we can fill cat_name and bio separately.
const BIO_CONTRACT = `\n\nReturn ONLY a JSON object in this exact shape: {"name": "...", "bio": "..."}`;

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

// Keep roasts under 160 characters: whole sentences if they fit, otherwise cut at a word.
function fitRoast(roast: string, max = 160) {
    roast = roast.trim();
    if (roast.length <= max) return roast;
    let out = '';
    for (const sentence of roast.match(/[^.!?]+[.!?]+/g) ?? []) {
        if ((out + sentence).trim().length > max) break;
        out += sentence;
    }
    if (out.trim()) return out.trim();
    return roast.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

// Plain-text step output: drop any reasoning block and wrapping quotes.
function cleanText(text: string) {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim().replace(/^["“]([\s\S]*)["”]$/, '$1').trim();
}

type Content = string | { type: string; text?: string; image_url?: { url: string } }[];
type Message = { role: 'system' | 'user'; content: Content };
type Usage = { prompt_tokens?: number; completion_tokens?: number };
type Call<T> = { latencyMs: number; raw: unknown } & (({ ok: true } & T) | { ok: false; detail: string });

function parseRaw(text: string): unknown {
    try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function chat(baseUrl: string, apiKey: string, model: string, messages: Message[], opts: { temperature?: number; maxTokens: number; json: boolean }): Promise<Call<{ text: string; usage: Usage }>> {
    const started = Date.now();
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
            max_completion_tokens: opts.maxTokens,
            ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
            messages,
        }),
    });
    const body = await res.text();
    const latencyMs = Date.now() - started;
    const raw = parseRaw(body);
    if (!res.ok) return { ok: false, detail: body, latencyMs, raw };
    const json = raw as { choices?: { message?: { content?: string } }[]; usage?: Usage };
    return { ok: true, text: json?.choices?.[0]?.message?.content ?? '', usage: json?.usage ?? {}, latencyMs, raw };
}

async function makeImage(baseUrl: string, falKey: string, model: string, prompt: string): Promise<Call<{ url: string }>> {
    const started = Date.now();
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/${model}`, {
        method: 'POST',
        headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, image_size: 'landscape_4_3', num_images: 1, num_inference_steps: 4, enable_safety_checker: true }),
    });
    const body = await res.text();
    const latencyMs = Date.now() - started;
    const raw = parseRaw(body);
    if (!res.ok) return { ok: false, detail: body, latencyMs, raw };
    const url = (raw as { images?: { url?: unknown }[] })?.images?.[0]?.url;
    return typeof url === 'string' ? { ok: true, url, latencyMs, raw } : { ok: false, detail: body, latencyMs, raw };
}

function describeMessages(messages: Message[]) {
    return messages.map(m => {
        const text = typeof m.content === 'string'
            ? m.content
            : m.content.map(p => p.text ?? (p.image_url ? `[image] ${p.image_url.url}` : '')).join('\n');
        return `[${m.role}]\n${text}`;
    }).join('\n\n');
}

// --- Database-driven pipeline ---

type Provider = { base_url: string | null; api_key_env: string | null; is_active: boolean };
type Model = { id: number; model_id: string; kind: 'text' | 'vision' | 'image'; supports_temperature: boolean; is_active: boolean; llm_providers: Provider | null };
type Step = {
    id: number;
    step_order: number;
    name: string;
    system_prompt: string | null;
    prompt_template: string;
    temperature: number | null;
    max_tokens: number | null;
    output_key: string;
    term_category: string | null;
    is_active: boolean;
    llm_models: Model | null;
};
type MixRow = {
    id: number;
    prompt_chain_mix_items: {
        run_order: number;
        is_enabled: boolean;
        prompt_chains: { id: number; is_active: boolean; prompt_chain_steps: Step[] } | null;
    }[];
};
type ReadyStep = Step & { llm_models: Model & { llm_providers: Provider } };

async function loadSteps(supabase: Supabase, mix: MixRow | null): Promise<ReadyStep[] | null> {
    if (!mix) return null;
    const chains = mix.prompt_chain_mix_items
        .filter(i => i.is_enabled && i.prompt_chains?.is_active)
        .sort((a, b) => a.run_order - b.run_order);
    const steps = chains.flatMap(i => i.prompt_chains!.prompt_chain_steps
        .filter(s => s.is_active)
        .sort((a, b) => a.step_order - b.step_order));
    if (!steps.length) return null;
    // Every step needs a usable model and provider, otherwise fall back rather than half-run.
    for (const s of steps) {
        const m = s.llm_models;
        if (!m?.is_active || !m.llm_providers?.is_active || !m.llm_providers.base_url || !m.llm_providers.api_key_env) return null;
    }
    return steps as ReadyStep[];
}

function pickWeighted<T extends { weight: number }>(items: T[]): T | null {
    const total = items.reduce((sum, i) => sum + Math.max(i.weight, 0), 0);
    if (total <= 0) return items[0] ?? null;
    let r = Math.random() * total;
    for (const item of items) {
        r -= Math.max(item.weight, 0);
        if (r < 0) return item;
    }
    return items[items.length - 1] ?? null;
}

// Templates are stored with a literal "\n"; turn those into real newlines.
function fill(template: string, vars: Record<string, string>) {
    return template
        .replace(/\\n/g, '\n')
        .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
}

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
    const { data: mix } = await supabase
        .from('prompt_chain_mixes')
        .select(`id, prompt_chain_mix_items(run_order, is_enabled, prompt_chains(id, is_active,
            prompt_chain_steps(id, step_order, name, system_prompt, prompt_template, temperature, max_tokens, output_key, term_category, is_active,
                llm_models(id, model_id, kind, supports_temperature, is_active, llm_providers(base_url, api_key_env, is_active)))))`)
        .eq('slug', kind)
        .eq('is_active', true)
        .maybeSingle<MixRow>();

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

    const logResponse = async (entry: {
        stepId: number | null; modelId: number | null; promptSent: string; temperature?: number;
        call: Call<object>; text?: string; usage?: Usage;
    }) => {
        if (!requestId) return;
        await supabase.from('llm_responses').insert({
            request_id: requestId,
            step_id: entry.stepId,
            model_id: entry.modelId,
            prompt_sent: entry.promptSent,
            response_text: entry.text ?? null,
            response_json: entry.call.raw ?? null,
            temperature: entry.temperature ?? null,
            prompt_tokens: entry.usage?.prompt_tokens ?? null,
            completion_tokens: entry.usage?.completion_tokens ?? null,
            latency_ms: entry.call.latencyMs,
            error: entry.call.ok ? null : entry.call.detail.slice(0, 4000),
        });
    };

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
            const steps = await loadSteps(supabase, mix ?? null);
            send({ steps: steps ? steps.map(s => s.name) : fallbackSteps });
            let parsed: Parsed;
            let imageUrl: string;
            let fullPrompt: string;
            let imagePrompt: string | null = null;
            let model: string;

            if (steps) {
                // Terms and examples are only read when a step needs them; cache per request.
                const termCache = new Map<string, { term: string; weight: number }[]>();
                const termsFor = async (category: string) => {
                    if (!termCache.has(category)) {
                        const { data } = await supabase.from('terms').select('term, weight').eq('category', category).eq('is_active', true);
                        termCache.set(category, data ?? []);
                    }
                    return termCache.get(category)!;
                };
                let examples: Record<string, string> | null = null;
                const examplesFor = async () => {
                    if (!examples) {
                        const { data } = await supabase
                            .from('generation_examples')
                            .select('kind, output, neighborhood')
                            .eq('is_active', true)
                            .in('kind', ['bio', 'tip']);
                        // Prefer examples written for this neighborhood, then the rest.
                        const rows = (data ?? []).sort((a, b) => Number(b.neighborhood === neighborhood) - Number(a.neighborhood === neighborhood));
                        const format = (k: string) => rows.filter(r => r.kind === k).slice(0, 3).map(r => `- ${r.output}`).join('\n');
                        examples = { 'examples.bio': format('bio'), 'examples.tip': format('tip') };
                    }
                    return examples;
                };

                const outputs: Record<string, string> = {};
                const textPrompts: string[] = [];
                let textModel: string | null = null;

                for (const step of steps) {
                    begin(step.name);
                    const m = step.llm_models;
                    const apiKey = process.env[m.llm_providers.api_key_env!];
                    if (!apiKey) return await fail(500, { error: `${m.llm_providers.api_key_env} is not set.` });

                    const tone = step.term_category ? pickWeighted(await termsFor(step.term_category))?.term ?? '' : '';
                    const vars: Record<string, string> = {
                        neighborhood: neighborhood ?? 'New York City',
                        vibe: vibe ?? '',
                        location: location ?? '',
                        tone,
                        image_url: outputs.image_url ?? inputImageUrl ?? '',
                        ...(step.prompt_template.includes('{{examples.') ? await examplesFor() : {}),
                        ...Object.fromEntries(Object.entries(outputs).map(([k, v]) => [`prev.${k}`, v])),
                    };

                    if (m.kind === 'image') {
                        let prompt = fill(step.prompt_template, vars);
                        if (extra) prompt += ` ${extra}.`;
                        const call = await makeImage(m.llm_providers.base_url!, apiKey, m.model_id, prompt);
                        await logResponse({ stepId: step.id, modelId: m.id, promptSent: prompt, call, text: call.ok ? call.url : undefined });
                        if (!call.ok) return await fail(502, { error: 'Image generation failed.', detail: call.detail });
                        imagePrompt = prompt;
                        outputs[step.output_key] = call.url;
                        complete(step.name);
                        continue;
                    }

                    // Vision: attach the photo for vision models, or any step whose template asks for {{image_url}}.
                    const photo = vars.image_url && (m.kind === 'vision' || step.prompt_template.includes('{{image_url}}')) ? vars.image_url : null;
                    const isBio = step.output_key === 'bio';
                    let text = fill(step.prompt_template, photo ? { ...vars, image_url: '' } : vars).trim();
                    if (isBio) text += BIO_CONTRACT;
                    if (photo && !text) text = 'Here is the photo.';

                    const messages: Message[] = [];
                    if (step.system_prompt) messages.push({ role: 'system', content: fill(step.system_prompt, vars) });
                    messages.push({ role: 'user', content: photo ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: photo } }] : text });

                    const temperature = m.supports_temperature && step.temperature !== null ? Number(step.temperature) : undefined;
                    const call = await chat(m.llm_providers.base_url!, apiKey, m.model_id, messages, { temperature, maxTokens: step.max_tokens ?? 500, json: isBio });
                    await logResponse({ stepId: step.id, modelId: m.id, promptSent: describeMessages(messages), temperature, call, text: call.ok ? call.text : undefined, usage: call.ok ? call.usage : undefined });
                    if (!call.ok) return await fail(502, { error: 'AI request failed.', detail: call.detail });

                    if (isBio) {
                        let bio: Parsed;
                        try {
                            bio = JSON.parse(cleanText(call.text));
                        } catch {
                            return await fail(502, { error: 'Could not parse AI response.', raw: call.text });
                        }
                        outputs.name = bio.name ?? '';
                        outputs.bio = bio.bio ?? '';
                    } else {
                        outputs[step.output_key] = cleanText(call.text);
                    }
                    if (isBio) textModel = m.model_id;
                    if (isBio || step.output_key === 'tip') textPrompts.push(describeMessages(messages));
                    complete(step.name);
                }

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
                    bio: parsed.bio,
                    tip: fitRoast(parsed.roast),
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
