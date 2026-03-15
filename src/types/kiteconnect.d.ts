declare module 'kiteconnect' {
    export class KiteConnect {
        constructor(params: { api_key: string });
        setAccessToken(token: string): void;
        getLoginURL(): string;
        generateSession(request_token: string, api_secret: string): Promise<{ access_token: string }>;
        getQuote(instruments: string[]): Promise<Record<string, {
            last_price: number;
            volume: number;
            ohlc: {
                open: number;
                high: number;
                low: number;
                close: number;
            };
        }>>;
    }    
    export class KiteTicker {
        constructor(params: { api_key: string, access_token: string });
        connect(): void;
        disconnect(): void;
        on(event: string, callback: (...args: any[]) => void): void;
        subscribe(tokens: number[]): void;
        unsubscribe(tokens: number[]): void;
        setMode(mode: string, tokens: number[]): void;
        modeFull: string;
        modeQuote: string;
        modeLTP: string;
    }}
