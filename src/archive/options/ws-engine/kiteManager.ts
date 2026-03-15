import { KiteConnect, KiteTicker } from 'kiteconnect';
import { handleTick } from './quantEngine';
import fs from 'fs';
import path from 'path';

let kiteInstance: KiteConnect | null = null;
let tickerInstance: KiteTicker | null = null;
let currentToken = '';

// Optionally persist token to a local file so the server survives restarts without requiring a new browser login
const TOKEN_FILE = path.join(process.cwd(), '.kite_token');

export function getKiteToken(): string | null {
    if (currentToken) return currentToken;
    if (fs.existsSync(TOKEN_FILE)) {
        currentToken = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
        return currentToken;
    }
    return null;
}

export function saveKiteToken(token: string) {
    currentToken = token;
    fs.writeFileSync(TOKEN_FILE, token, 'utf-8');
}

export function initializeKiteManager(token: string, io: any) {
    const apiKey = process.env.KITE_API_KEY;
    if (!apiKey) {
        console.error('[Kite Manager] KITE_API_KEY is not set in .env.local');
        return;
    }

    if (token !== currentToken) saveKiteToken(token);

    console.log('[Kite Manager] Initializing KiteConnect with access token...');
    kiteInstance = new KiteConnect({ api_key: apiKey });
    kiteInstance.setAccessToken(token);

    // Initialize Kite Ticker
    if (tickerInstance) {
        console.log('[Kite Manager] Disconnecting old Ticker instance...');
        try { 
            tickerInstance.disconnect();
            // Give it a tiny delay to clean up sockets
            setTimeout(() => connectNewTicker(apiKey, token, kiteInstance!), 500);
            return;
        } catch(e) {}
    }

    connectNewTicker(apiKey, token, kiteInstance);
}

function connectNewTicker(apiKey: string, token: string, kiteInstance: any) {
    console.log('[Kite Manager] Connecting new Ticker instance...');
    
    // Create new ticker instance
    const newTicker = new KiteTicker({
        api_key: apiKey,
        access_token: token
    });
    
    // Prevent the Kite library from calling process.exit(1) on disconnect by monkey patching attemptReconnection
    const originalAttemptReconnection = (newTicker as any).attemptReconnection;
    (newTicker as any).attemptReconnection = function() {
        if (!this.auto_reconnect || this.should_reconnect === false) {
            console.log('[Kite Manager] Suppressed internal process.exit(1) from KiteTicker disconnect');
            return;
        }
        if (originalAttemptReconnection) originalAttemptReconnection.apply(this);
    };

    tickerInstance = newTicker;
    
    tickerInstance.connect();

    tickerInstance.on('ticks', (ticks: any[]) => {
        handleTick(ticks);
    });

    tickerInstance.on('connect', () => {
        console.log('[Kite Manager] Ticker connected successfully');
        // Let quantEngine handle subscription once instruments are fetched
        import('./quantEngine').then(mod => {
            mod.onTickerConnect(tickerInstance!, kiteInstance!);
        });
    });

    tickerInstance.on('disconnect', () => {
        console.log('[Kite Manager] Ticker disconnected');
    });

    tickerInstance.on('error', (e: any) => {
        console.error('[Kite Manager] Ticker error:', e);
    });
}

export function getKiteInstance() {
    return kiteInstance;
}

export function getTickerInstance() {
    return tickerInstance;
}
