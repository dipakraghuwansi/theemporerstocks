require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

async function testVolume() {
    try {
        const apiKey = process.env.NEXT_PUBLIC_KITE_API_KEY;
        const token = "isX4H3Iz27xws6lhElneTKNKxK3Cht4X";
        const underlying = "NIFTY";
        const atmStrike = 25600;
        const strikeInterval = 50;

        // Fetch instruments
        const iRes = await axios.get("http://localhost:3000/api/instruments?q=NFO:NIFTY&limit=ALL");
        const nfoInstruments = iRes.data.data.filter((i) => {
            if (!i.value || !i.value.startsWith('NFO:')) return false;
            const symbolWithoutExchange = i.value.split(':')[1];
            const regex = new RegExp('^' + underlying + '\\d+');
            return regex.test(symbolWithoutExchange) && !symbolWithoutExchange.endsWith('FUT');
        });

        if (nfoInstruments.length === 0) throw new Error("No derivative instruments found");

        const expiries = Array.from(new Set(nfoInstruments.map((i) => i.expiry).filter(Boolean))).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        let nearestExpiry = expiries[0];

        let targetInstruments = nfoInstruments;
        if (nearestExpiry) {
            targetInstruments = nfoInstruments.filter((i) => i.expiry === nearestExpiry);
        }

        targetInstruments = targetInstruments.filter((i) => {
            const sym = i.value.split(':')[1];
            const strikeMatch = sym.match(/(\d+)(CE|PE)$/);
            if (!strikeMatch) return false;
            const strike = parseFloat(strikeMatch[1]);
            return Math.abs(strike - atmStrike) <= (strikeInterval * 10);
        });

        const callSymbols = targetInstruments.filter((i) => i.value.endsWith('CE')).map((i) => i.value);
        const putSymbols = targetInstruments.filter((i) => i.value.endsWith('PE')).map((i) => i.value);

        const allSymbols = [...callSymbols, ...putSymbols];

        console.log("All Symbols:", allSymbols.length, "Closest Expiry:", nearestExpiry);

        if (allSymbols.length === 0) {
            console.log("No symbols to fetch!");
            return;
        }

        const url = `https://api.kite.trade/quote?i=${allSymbols.join('&i=')}`;

        console.log("Fetching quotes...");
        const res = await axios.get(url, {
            headers: {
                'X-Kite-Version': '3',
                'Authorization': `token ${apiKey}:${token}`
            }
        });

        let totalPutVolume = 0;
        let totalCallVolume = 0;
        const quotes = res.data.data; // Note: axios returns res.data.data from kite
        for (const symbol of allSymbols) {
            const quote = quotes[symbol];
            if (quote && quote.volume !== undefined) {
                if (symbol.endsWith('PE')) {
                    totalPutVolume += quote.volume;
                } else if (symbol.endsWith('CE')) {
                    totalCallVolume += quote.volume;
                }
            }
        }

        console.log({ totalCallVolume, totalPutVolume });

    } catch (err) {
        console.error("Error:", err.response ? err.response.data : err.message);
    }
}
testVolume();
