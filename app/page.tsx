import { supabase } from './lib/supabase';

export default async function Home() {
    const { data: images, error } = await supabase
        .from('images')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        return <main><p>Error loading images: {error.message}</p></main>;
    }

    return (
        <main style={{ padding: '2rem', display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {images?.map((img) => (
                <div key={img.id} style={{ border: '1px solid #333', borderRadius: 8, overflow: 'hidden' }}>
                    <img src={img.image_url} alt={img.caption} style={{ width: '100%', display: 'block' }} />
                    <p style={{ padding: '0.75rem' }}>{img.caption}</p>
                </div>
            ))}
        </main>
    );
}