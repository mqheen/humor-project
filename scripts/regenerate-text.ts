// Re-runs the bio and roast steps of the DB-driven chain for every published cat and overwrites
// generations.bio and generations.tip. The image, name, votes and created_at are left alone.
//
//   node scripts/regenerate-text.ts --dry-run [--limit N] [--id N]   call the models and print before/after, write nothing
//   node scripts/regenerate-text.ts [--limit N] [--id N]             also overwrite bio and tip, and log the requests
//
// Reads .env.local for the Supabase URL, the provider keys the steps name (GROQ_API_KEY, ...) and
// SUPABASE_SERVICE_ROLE_KEY. Both modes need the service key: the prompt-chain tables are readable by
// signed-in users only. The key is never printed or written anywhere.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fitText, loadMix, loadSteps, makeResponseLogger, runSteps } from '../app/lib/pipeline.ts';
import type { ReadyStep } from '../app/lib/pipeline.ts';
import { TEXT_LIMITS, isNeighborhood, isVibe } from '../app/lib/nyc.ts';

try { process.loadEnvFile('.env.local'); } catch { /* fall back to the real environment */ }

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? Number(args[i + 1]) : null;
};
const limit = flag('--limit');
const onlyId = flag('--id');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (add the key to .env.local for this run).');
    process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

type Cat = {
    id: number; user_id: string; kind: 'spotted' | 'generated'; neighborhood: string | null; location: string | null;
    image_url: string; image_prompt: string | null; cat_name: string; bio: string; tip: string | null;
};

// The vibe isn't stored on the cat. The original request has it; failing that, the image prompt does.
async function vibeFor(cat: Cat) {
    if (cat.kind !== 'generated') return null;
    const { data } = await supabase.from('generation_requests').select('inputs').eq('generation_id', cat.id).order('id').limit(1).maybeSingle();
    const fromRequest = (data?.inputs as { vibe?: unknown } | undefined)?.vibe;
    if (isVibe(fromRequest)) return fromRequest;
    const fromPrompt = cat.image_prompt?.match(/Its vibe: ([^.]+)\./)?.[1] ?? cat.image_prompt?.match(/\. ([^.]+) vibe\./)?.[1];
    return isVibe(fromPrompt) ? fromPrompt : null;
}

let query = supabase
    .from('generations')
    .select('id, user_id, kind, neighborhood, location, image_url, image_prompt, cat_name, bio, tip')
    .eq('is_published', true)
    .order('id');
if (onlyId) query = query.eq('id', onlyId);
if (limit) query = query.limit(limit);
const { data: cats, error: catsError } = await query.returns<Cat[]>();
if (catsError) { console.error(`Could not load cats: ${catsError.message}`); process.exit(1); }
if (!cats?.length) { console.log('No published cats.'); process.exit(0); }

// One mix per kind, loaded once.
const chains = new Map<string, { mixId: number; steps: ReadyStep[] }>();
for (const kind of new Set(cats.map((c) => c.kind))) {
    const mix = await loadMix(supabase, kind);
    const steps = await loadSteps(mix);
    if (!mix || !steps) { console.error(`No usable active "${kind}" chain (mix, steps, models and providers must all be active).`); process.exit(1); }
    chains.set(kind, { mixId: mix.id, steps });
}

console.log(`${dryRun ? 'DRY RUN: ' : ''}Regenerating bio and roast for ${cats.length} published cat${cats.length === 1 ? '' : 's'}.\n`);

// Keep the old text somewhere outside the repo so a real run can be undone by hand.
const backup = join(tmpdir(), `regenerate-text-backup-${Date.now()}.json`);
if (!dryRun) {
    writeFileSync(backup, JSON.stringify(cats.map((c) => ({ id: c.id, bio: c.bio, tip: c.tip })), null, 2));
    console.log(`Old text saved to ${backup}\n`);
}

let updated = 0;
const failed: string[] = [];

// The provider's rate limits are tight, so space the cats out and give a 429 a full minute to clear.
const PAUSE_BETWEEN_CATS_MS = 12_000;
const RATE_LIMIT_WAIT_MS = 60_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

for (const [index, cat] of cats.entries()) {
    if (index > 0) await sleep(PAUSE_BETWEEN_CATS_MS);
    const { mixId, steps } = chains.get(cat.kind)!;
    const neighborhood = isNeighborhood(cat.neighborhood) ? cat.neighborhood : null;
    const vibe = await vibeFor(cat);
    const inputs = { neighborhood, vibe, location: cat.location, inputImageUrl: cat.kind === 'spotted' ? cat.image_url : null, extra: '' };
    const label = `#${cat.id} ${cat.cat_name} (${neighborhood ?? cat.location ?? 'NYC'})`;

    // One attempt = one generation_requests row (marked as a regeneration in inputs) and one pass over the
    // steps. Dry runs log nothing. Keep the picture (seed it) and skip image steps; the photo-description
    // step for spotted cats still runs because the bio step reads it.
    const attempt = async () => {
        let requestId: number | null = null;
        const startedAt = Date.now();
        if (!dryRun) {
            const { data } = await supabase
                .from('generation_requests')
                .insert({
                    user_id: cat.user_id, kind: cat.kind, mix_id: mixId, generation_id: cat.id, status: 'running',
                    inputs: { note: 'regenerate', neighborhood, vibe, image_url: cat.image_url },
                })
                .select('id')
                .single();
            requestId = data?.id ?? null;
        }
        const finish = async (patch: { status: 'succeeded' | 'failed'; error?: string }) => {
            if (!requestId) return;
            await supabase.from('generation_requests')
                .update({ ...patch, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt })
                .eq('id', requestId);
        };
        const result = await runSteps(supabase, steps, inputs, {
            skipImage: true,
            seed: { image_url: cat.image_url },
            log: makeResponseLogger(supabase, requestId),
        });
        return { run: result, finish };
    };

    let { run, finish } = await attempt();
    if (!run.ok && run.upstreamStatus === 429) {
        console.log(`${label}\n  Rate limited. Waiting ${RATE_LIMIT_WAIT_MS / 1000}s, then trying once more.\n`);
        await finish({ status: 'failed', error: 'Rate limited (429); retrying once.' });
        await sleep(RATE_LIMIT_WAIT_MS);
        ({ run, finish } = await attempt());
    }

    const bio = run.ok ? fitText(run.outputs.bio ?? '', TEXT_LIMITS.bio) : '';
    const tip = run.ok ? fitText(run.outputs.tip ?? '', TEXT_LIMITS.tip) : '';
    if (!run.ok || !bio || !tip) {
        const reason = run.ok ? 'the model returned an empty bio or roast' : `${run.error}${run.detail ? ` ${run.detail.slice(0, 200)}` : ''}`;
        console.log(`${label}\n  SKIPPED: ${reason}\n`);
        failed.push(label);
        await finish({ status: 'failed', error: reason.slice(0, 4000) });
        continue;
    }

    console.log(label);
    console.log(`  bio    before: ${cat.bio}\n         after:  ${bio}`);
    console.log(`  roast  before: ${cat.tip ?? ''}\n         after:  ${tip}\n`);

    if (!dryRun) {
        const { error } = await supabase.from('generations').update({ bio, tip }).eq('id', cat.id);
        if (error) {
            console.log(`  WRITE FAILED: ${error.message}\n`);
            failed.push(label);
            await finish({ status: 'failed', error: error.message });
            continue;
        }
        await finish({ status: 'succeeded' });
    }
    updated += 1;
}

console.log(`${dryRun ? 'Would update' : 'Updated'} ${updated} of ${cats.length}.${failed.length ? ` Failed: ${failed.join(', ')}` : ''}`);
if (failed.length) process.exitCode = 1;
