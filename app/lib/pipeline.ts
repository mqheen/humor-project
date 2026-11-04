// The database-driven generation pipeline (mix -> chains -> steps), shared by app/api/generate/route.ts
// and scripts/regenerate-text.ts. Imports stay type-only so Node can run the script without a bundler.
import type { SupabaseClient } from '@supabase/supabase-js';

export type Content = string | { type: string; text?: string; image_url?: { url: string } }[];
export type Message = { role: 'system' | 'user'; content: Content };
export type Usage = { prompt_tokens?: number; completion_tokens?: number };
export type Call<T> = { latencyMs: number; raw: unknown } & (({ ok: true } & T) | { ok: false; detail: string });

// The bio step's template asks for "your name and a bio" in prose; this pins the shape so
// we can fill cat_name and bio separately.
export const BIO_CONTRACT = `\n\nReturn ONLY a JSON object in this exact shape: {"name": "...", "bio": "..."}`;

// Whole sentences if they fit, otherwise cut at a word.
export function fitText(text: string, max: number) {
    text = text.trim();
    if (text.length <= max) return text;
    let out = '';
    for (const sentence of text.match(/[^.!?]+[.!?]+/g) ?? []) {
        if ((out + sentence).trim().length > max) break;
        out += sentence;
    }
    if (out.trim()) return out.trim();
    return text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

// Plain-text step output: drop any reasoning block and wrapping quotes.
export function cleanText(text: string) {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim().replace(/^["“]([\s\S]*)["”]$/, '$1').trim();
}

function parseRaw(text: string): unknown {
    try { return JSON.parse(text); } catch { return { raw: text }; }
}

export async function chat(baseUrl: string, apiKey: string, model: string, messages: Message[], opts: { temperature?: number; maxTokens: number; json: boolean }): Promise<Call<{ text: string; usage: Usage }>> {
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

export async function makeImage(baseUrl: string, falKey: string, model: string, prompt: string): Promise<Call<{ url: string }>> {
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

export function describeMessages(messages: Message[]) {
    return messages.map(m => {
        const text = typeof m.content === 'string'
            ? m.content
            : m.content.map(p => p.text ?? (p.image_url ? `[image] ${p.image_url.url}` : '')).join('\n');
        return `[${m.role}]\n${text}`;
    }).join('\n\n');
}

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
export type MixRow = {
    id: number;
    prompt_chain_mix_items: {
        run_order: number;
        is_enabled: boolean;
        prompt_chains: { id: number; is_active: boolean; prompt_chain_steps: Step[] } | null;
    }[];
};
export type ReadyStep = Step & { llm_models: Model & { llm_providers: Provider } };

// The active mix for a kind ('spotted' | 'generated'), with its chains, steps, models and providers.
export async function loadMix(supabase: SupabaseClient, kind: string): Promise<MixRow | null> {
    const { data } = await supabase
        .from('prompt_chain_mixes')
        .select(`id, prompt_chain_mix_items(run_order, is_enabled, prompt_chains(id, is_active,
            prompt_chain_steps(id, step_order, name, system_prompt, prompt_template, temperature, max_tokens, output_key, term_category, is_active,
                llm_models(id, model_id, kind, supports_temperature, is_active, llm_providers(base_url, api_key_env, is_active)))))`)
        .eq('slug', kind)
        .eq('is_active', true)
        .maybeSingle<MixRow>();
    return data ?? null;
}

export async function loadSteps(mix: MixRow | null): Promise<ReadyStep[] | null> {
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

export type StepLog = {
    stepId: number | null; modelId: number | null; promptSent: string; temperature?: number;
    call: Call<object>; text?: string; usage?: Usage;
};

// Writes one llm_responses row per call. Logging is best effort: with no request row, it does nothing.
export function makeResponseLogger(supabase: SupabaseClient, requestId: number | null) {
    return async (entry: StepLog) => {
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
}

export type RunInputs = {
    neighborhood: string | null;
    vibe: string | null;
    location: string | null;
    inputImageUrl: string | null;
    extra: string;
};

export type RunOptions = {
    // Skip image-generating steps; pair with seed.image_url to keep an existing picture.
    skipImage?: boolean;
    seed?: Record<string, string>;
    begin?: (step: string) => void;
    complete?: (step: string) => void;
    log?: (entry: StepLog) => Promise<void>;
};

export type RunResult =
    | { ok: true; outputs: Record<string, string>; imagePrompt: string | null; textPrompts: string[]; textModel: string | null }
    | { ok: false; status: number; error: string; detail?: string; raw?: string };

// Runs the steps in order, each one seeing earlier outputs as {{prev.<key>}}.
export async function runSteps(supabase: SupabaseClient, steps: ReadyStep[], inputs: RunInputs, opts: RunOptions = {}): Promise<RunResult> {
    const { neighborhood, vibe, location, inputImageUrl, extra } = inputs;

    // Terms and examples are only read when a step needs them; cache per run.
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

    const outputs: Record<string, string> = { ...opts.seed };
    const textPrompts: string[] = [];
    let textModel: string | null = null;
    let imagePrompt: string | null = null;

    for (const step of steps) {
        const m = step.llm_models;
        if (m.kind === 'image' && opts.skipImage) continue;

        opts.begin?.(step.name);
        const apiKey = process.env[m.llm_providers.api_key_env!];
        if (!apiKey) return { ok: false, status: 500, error: `${m.llm_providers.api_key_env} is not set.` };

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
            await opts.log?.({ stepId: step.id, modelId: m.id, promptSent: prompt, call, text: call.ok ? call.url : undefined });
            if (!call.ok) return { ok: false, status: 502, error: 'Image generation failed.', detail: call.detail };
            imagePrompt = prompt;
            outputs[step.output_key] = call.url;
            opts.complete?.(step.name);
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
        await opts.log?.({ stepId: step.id, modelId: m.id, promptSent: describeMessages(messages), temperature, call, text: call.ok ? call.text : undefined, usage: call.ok ? call.usage : undefined });
        if (!call.ok) return { ok: false, status: 502, error: 'AI request failed.', detail: call.detail };

        if (isBio) {
            let bio: { name?: string; bio?: string };
            try {
                bio = JSON.parse(cleanText(call.text));
            } catch {
                return { ok: false, status: 502, error: 'Could not parse AI response.', raw: call.text };
            }
            outputs.name = bio.name ?? '';
            outputs.bio = bio.bio ?? '';
        } else {
            outputs[step.output_key] = cleanText(call.text);
        }
        if (isBio) textModel = m.model_id;
        // output_key 'tip' is the roast step; it feeds the generations.tip column.
        if (isBio || step.output_key === 'tip') textPrompts.push(describeMessages(messages));
        opts.complete?.(step.name);
    }

    return { ok: true, outputs, imagePrompt, textPrompts, textModel };
}
