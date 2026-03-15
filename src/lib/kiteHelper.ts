import { KiteConnect } from 'kiteconnect';

export const KITE_API_KEY = process.env.KITE_API_KEY || '';
export const KITE_API_SECRET = process.env.KITE_API_SECRET || '';

// Function to initialize a KiteConnect instance (add cast to loose any so it stops complaining about getHistoricalData)
export function getKiteInstance(accessToken?: string): any {
    const kite = new KiteConnect({
        api_key: KITE_API_KEY,
    });

    if (accessToken) {
        kite.setAccessToken(accessToken);
    }

    return kite;
}
