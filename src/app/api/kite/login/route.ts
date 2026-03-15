import { NextResponse } from 'next/server';
import { getKiteInstance, KITE_API_KEY } from '@/lib/kiteHelper';

export async function GET() {
    if (!KITE_API_KEY) {
        return NextResponse.json(
            { error: 'KITE_API_KEY is missing in environment variables.' },
            { status: 500 }
        );
    }

    const kite = getKiteInstance();
    const loginUrl = kite.getLoginURL();

    // Redirect the user to the Zerodha Kite Connect login page
    return NextResponse.redirect(loginUrl);
}
