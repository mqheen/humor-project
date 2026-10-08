import { createClient } from '@/app/lib/supabase/server';
import Storefront from '@/app/components/Storefront';

export default async function AdoptPage() {
    const supabase = await createClient();
    const { data: cats, error } = await supabase.from('images').select('*').order('id', { ascending: true });

    if (error) {
        return <main className="container" style={{ paddingBlock: '3rem' }}><p className="error">Error loading cats: {error.message}</p></main>;
    }

    return (
        <main>
            <Storefront id="adopt" variant="mint">
                <h1>Nine Lives shelter</h1>
                <p>{cats?.length ?? 0} cats here are looking for a home. If one of the street cats on the feed won you over, this is where to start.</p>
            </Storefront>

            <div className="container">
                <section className="grid">
                    {cats?.map((cat) => (
                        <article key={cat.id} className="card">
                            <img src={cat.image_url} alt={cat.name ?? 'Cat'} />
                            <div className="card-body">
                                <div className="card-head">
                                    <div className="card-title">
                                        <h2 className="card-name">{cat.name}</h2>
                                        {cat.breed && <span className="sticker">{cat.breed}</span>}
                                    </div>
                                    <span className="card-meta">{cat.age}</span>
                                </div>
                                <p className="card-bio">{cat.description}</p>
                            </div>
                        </article>
                    ))}
                </section>
            </div>
        </main>
    );
}
