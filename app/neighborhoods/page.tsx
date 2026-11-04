import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/server';
import Storefront from '@/app/components/Storefront';
import InfoTip from '@/app/components/InfoTip';
import { ROAST_HELP } from '@/app/components/CatCard';
import { NEIGHBORHOODS } from '@/app/lib/nyc';

type Row = {
    id: number; image_url: string; cat_name: string; tip: string | null; neighborhood: string; created_at: string;
    votes: { value: number }[];
};
type Cat = Row & { score: number; ups: number };
type Hood = { name: string; cats: number; ups: number; score: number; top: Cat | null };

export default async function NeighborhoodsPage() {
    const supabase = await createClient();
    // One query: published cats with their votes, grouped by neighborhood below. Drafts never count.
    const { data } = await supabase
        .from('generations')
        .select('id, image_url, cat_name, tip, neighborhood, created_at, votes(value)')
        .eq('is_published', true)
        .not('neighborhood', 'is', null);

    const hoods = new Map<string, Hood>(NEIGHBORHOODS.map((name) => [name, { name, cats: 0, ups: 0, score: 0, top: null }]));
    for (const row of (data ?? []) as unknown as Row[]) {
        const hood = hoods.get(row.neighborhood);
        if (!hood) continue;
        const cat: Cat = {
            ...row,
            score: row.votes.reduce((s, v) => s + v.value, 0),
            ups: row.votes.filter((v) => v.value > 0).length,
        };
        hood.cats += 1;
        hood.ups += cat.ups;
        hood.score += cat.score;
        // Best cat: highest score, then most upvotes, then newest.
        const t = hood.top;
        if (!t || cat.score > t.score || (cat.score === t.score && (cat.ups > t.ups || (cat.ups === t.ups && cat.created_at > t.created_at)))) hood.top = cat;
    }

    // Ranked by net score, then upvotes, then number of cats; ties keep the fixed neighborhood order.
    const all = [...hoods.values()];
    const ranked = all.filter((h) => h.cats > 0).sort((a, b) => b.score - a.score || b.ups - a.ups || b.cats - a.cats);
    const empty = all.filter((h) => h.cats === 0);

    return (
        <main>
            <Storefront id="neighborhoods" variant="mint">
                <h1>Who’s getting roasted hardest</h1>
                <p>Every neighborhood’s top cat, ranked by the votes its roasts have earned.</p>
            </Storefront>

            <div className="container" style={{ padding: '2.5rem 1.5rem 5rem' }}>
                <ol className="board">
                    {ranked.map((h, i) => (
                        <li key={h.name} className="board-row">
                            <span className="board-rank" aria-label={`Rank ${i + 1}`}>{i + 1}</span>
                            <div className="board-main">
                                <h2 className="board-hood"><Link href={`/?${new URLSearchParams({ neighborhood: h.name })}`}>{h.name}</Link></h2>
                                <p className="board-stats">
                                    <span>{h.cats} {h.cats === 1 ? 'cat' : 'cats'}</span>
                                    <span>▲ {h.ups} {h.ups === 1 ? 'upvote' : 'upvotes'}</span>
                                    <span>Net {h.score > 0 ? `+${h.score}` : h.score}</span>
                                </p>
                                {h.top && (
                                    <div className="board-top">
                                        <img src={h.top.image_url} alt={h.top.cat_name} />
                                        <div>
                                            <p className="board-cat">{h.top.cat_name}</p>
                                            {h.top.tip && (
                                                <>
                                                    <p className="card-label">The roast <InfoTip text={ROAST_HELP} label="About the roast" /></p>
                                                    <p className="board-roast">{h.top.tip}</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </li>
                    ))}
                    {empty.map((h) => (
                        <li key={h.name} className="board-row board-empty">
                            <span className="board-rank board-rank-none" aria-hidden="true">–</span>
                            <div className="board-main">
                                <h2 className="board-hood">{h.name}</h2>
                                <p className="board-stats">
                                    <span>No cat yet</span>
                                    <Link className="board-make" href={`/spot?${new URLSearchParams({ neighborhood: h.name })}`}>Make one</Link>
                                </p>
                            </div>
                        </li>
                    ))}
                </ol>
            </div>
        </main>
    );
}
