const { KiteConnect } = require('kiteconnect');
const dotenv = require('dotenv');
dotenv.config({ path: '/Users/dipakraghuwansi/theemporer/.env' });
const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY });
kite.setAccessToken("test"); // We can pass a dummy or we need the real access token to test. 
// Wait, we need a valid access token. Hmm.
