import { getKiteInstance } from './src/lib/kiteHelper';

const nifty50Cache = [
    "NSE:ADANIENT", "NSE:ADANIPORTS", "NSE:APOLLOHOSP", "NSE:ASIANPAINT",
    "NSE:AXISBANK", "NSE:BAJAJ-AUTO", "NSE:BAJFINANCE", "NSE:BAJAJFINSV",
    "NSE:BEL", "NSE:BPCL", "NSE:BHARTIARTL", "NSE:BRITANNIA", "NSE:CIPLA",
    "NSE:COALINDIA", "NSE:DIVISLAB", "NSE:DRREDDY", "NSE:EICHERMOT", "NSE:GRASIM",
    "NSE:HCLTECH", "NSE:HDFCBANK", "NSE:HDFCLIFE", "NSE:HEROMOTOCO", "NSE:HINDALCO",
    "NSE:HINDUNILVR", "NSE:ICICIBANK", "NSE:ITC", "NSE:INDUSINDBK", "NSE:INFY",
    "NSE:JSWSTEEL", "NSE:KOTAKBANK", "NSE:LT", "NSE:LTIM", "NSE:M&M", "NSE:MARUTI",
    "NSE:NESTLEIND", "NSE:NTPC", "NSE:ONGC", "NSE:POWERGRID", "NSE:RELIANCE",
    "NSE:SBILIFE", "NSE:SHRIRAMFIN", "NSE:SBIN", "NSE:SUNPHARMA", "NSE:TCS",
    "NSE:TATACONSUM", "NSE:TATAMOTORS", "NSE:TATASTEEL", "NSE:TECHM", "NSE:TITAN",
    "NSE:ULTRACEMCO", "NSE:WIPRO"
].slice(0, 50);

async function check() {
    const kite = getKiteInstance("YI6RzT3hN3SjK6WbI0s6OqjK5lYJ8i7p"); // Since we have the cookie token from requests, but wait, let's just make a fetch to localhost to get the response.
}
