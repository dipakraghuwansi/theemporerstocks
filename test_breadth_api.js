const http = require('http');

const fetchAPI = (path) => new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, { headers: { Cookie: 'kite_access_token=test' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
        });
    }).on('error', reject);
});

async function run() {
    try {
        console.log("Fetching structural-metrics...");
        const struct = await fetchAPI('/api/quant/structural-metrics?asset=NIFTY');
        console.log(JSON.stringify(struct, null, 2));
    } catch(e) {
        console.error(e);
    }
}
run();
