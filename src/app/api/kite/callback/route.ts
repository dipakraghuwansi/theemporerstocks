import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getKiteInstance, KITE_API_SECRET } from '@/lib/kiteHelper';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const requestToken = searchParams.get('request_token');

    if (!requestToken) {
        return NextResponse.json({ error: 'Missing request_token' }, { status: 400 });
    }

    try {
        const kite = getKiteInstance();
        const response = await kite.generateSession(requestToken, KITE_API_SECRET);

        // Securely set the access token in an HTTP-only cookie
        // Next.js stable app router approach:
        const cookieStore = await cookies();
        cookieStore.set({
            name: 'kite_access_token',
            value: response.access_token,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24, // 24 hours (Tokens usually expire early morning next day)
            path: '/',
        });

        // Redirect the user back to the dashboard
        return NextResponse.redirect(new URL('/', request.url));
    } catch (error: any) {
        console.error("Kite Callback Error:", error);
        return NextResponse.json(
            { error: 'Failed to generate Kite session', details: error.message },
            { status: 500 }
        );
    }
}
