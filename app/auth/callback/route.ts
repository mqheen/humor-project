import { createClient } from '@/app/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');

    // handle_new_user raises for emails signup_allowed() rejects, so Supabase sends a
    // blocked signup back here with ?error=server_error ("Database error saving new user").
    if (searchParams.get('error') || searchParams.get('error_description')) {
        return NextResponse.redirect(`${origin}/login?denied=1`);
    }

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
            return NextResponse.redirect(`${origin}/login?denied=1`);
        }

        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', user.id)
                .single();

            if (!profile?.first_name || !profile?.last_name) {
                return NextResponse.redirect(`${origin}/profile`);
            }
        }

        return NextResponse.redirect(`${origin}/`);
    }

    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
