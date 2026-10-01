import { createClient } from '@/app/lib/supabase/server';

export default async function Home() {
    const supabase = await createClient();
    const { data: cats, error } = await supabase
        .from('images')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        return <main className="container"><p className="muted">Error loading cats: {error.message}</p></main>;
    }

    return (
        <main className="container">
            <section className="hero">
                <p className="eyebrow">{cats?.length ?? 0} cats available for adoption</p>
                <h1>Every cat here is<br />looking for a home.</h1>
                <p>Browse the residents of Nine Lives. Sign in to manage your profile and keep track of the cats you love.</p>
            </section>

            <section className="grid">
                {cats?.map((cat) => (
                    <article key={cat.id} className="card">
                        <img src={cat.image_url} alt={cat.name ?? 'Cat'} />
                        <div className="card-body">
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.35rem' }}>
                                <h2 style={{ margin: 0, fontSize: '1.15rem', letterSpacing: '-0.01em' }}>{cat.name}</h2>
                                <span className="muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{cat.age}</span>
                            </div>
                            <p className="eyebrow" style={{ fontSize: '0.7rem', margin: '0 0 0.6rem' }}>{cat.breed}</p>
                            <p className="muted" style={{ fontSize: '0.92rem', lineHeight: 1.5 }}>{cat.description}</p>
                        </div>
                    </article>
                ))}
            </section>
        </main>
    );
}