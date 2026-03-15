"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BrainCircuit, Activity, LineChart as LineChartIcon, Target, Zap, ShieldAlert, BookOpen, Layers, Sigma } from 'lucide-react';

import {
    ComposedChart,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceDot,
    ReferenceLine
} from 'recharts';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function QuantDashboardV2() {
    const [assetName, setAssetName] = useState('NFO:NIFTY24OCT25600CE');
    const [backtestParams, setBacktestParams] = useState({
        asset: 'NIFTY50',
        strategy: 'HMM_MOMENTUM',
        fromDate: '2024-01-01',
        toDate: new Date().toISOString().split('T')[0]
    });

    const checkMarketOpen = () => {
        const nowStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        const nowArray = nowStr.split(', ');
        const timeArray = nowArray[1].split(':');

        let hours = parseInt(timeArray[0]);
        const mins = parseInt(timeArray[1]);
        const isPM = nowArray[1].includes('PM');

        if (isPM && hours !== 12) {
            hours += 12;
        } else if (!isPM && hours === 12) {
            hours = 0;
        }

        const currentInt = hours * 100 + mins;
        const dateObj = new Date(nowStr);
        const dayOfWeek = dateObj.getDay();

        return !(dayOfWeek === 0 || dayOfWeek === 6 || currentInt < 800 || currentInt > 1600);
    };

    const [isMarketOpen, setIsMarketOpen] = useState(true);

    useEffect(() => {
        setIsMarketOpen(checkMarketOpen());
        const interval = setInterval(() => {
            setIsMarketOpen(checkMarketOpen());
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    const [isBacktesting, setIsBacktesting] = useState(false);
    const [backtestResults, setBacktestResults] = useState<any>(null);

    const [targetLTP, setTargetLTP] = useState(150);
    const [impliedVolatility, setImpliedVolatility] = useState(0.18);

    const runBacktest = async () => {
        setIsBacktesting(true);
        try {
            const res = await fetch('/api/v2/backtest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(backtestParams)
            });
            const data = await res.json();
            console.log("Backtest Data Engine Response:", data);

            if (data.status === 'success') {
                setBacktestResults(data);
            } else {
                alert(`Backtest Failed: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsBacktesting(false);
        }
    };

    // Auto-poll the paper trades every 3 seconds for UI real-time feel
    const { data: paperData, error, isLoading, mutate: mutatePaper } = useSWR('/api/paper/trades', fetcher, {
        refreshInterval: isMarketOpen ? 3000 : 0,
        revalidateOnFocus: false
    });

    // Auto-poll the HMM regime every 5 seconds
    const { data: hmmData } = useSWR('/api/v2/regime', fetcher, {
        refreshInterval: isMarketOpen ? 5000 : 0,
        revalidateOnFocus: false
    });

    const { data: regimeHistory } = useSWR('/api/v2/regime/history', fetcher, {
        refreshInterval: isMarketOpen ? 15000 : 0,
        revalidateOnFocus: false
    });

    const executePaperTrade = async (direction: 'BUY' | 'SELL', strategyType: string, price: number) => {
        const payload = {
            strategySource: strategyType,
            assetName: assetName,
            direction: direction,
            entryPrice: price,
            qty: 25 // standard batch
        };

        const res = await fetch('/api/paper/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            mutatePaper();
        } else {
            const e = await res.json();
            alert(`Trade Failed: ${e.error || e.message}`);
        }
    };

    // Calculate options properties based on basic mock/greeks algorithm
    const strike = 25600;
    const isCall = assetName.endsWith('CE');
    const spotPrice = 25520; // Example live spot tracking (you could wire this up to SWR!)
    const currentLTP = isCall ? Math.max(spotPrice - strike + 50, 80) : Math.max(strike - spotPrice + 50, 80);

    const targetIntrinsic = isCall ? Math.max(spotPrice - strike, 0) : Math.max(strike - spotPrice, 0);
    const targetExtrinsic = targetLTP > targetIntrinsic ? targetLTP - targetIntrinsic : 0;

    // Reverse engineer spot for target premium (extremely simplified linear model for visual target)
    // Premium ~ Intrinsic + Extrinsic
    // Let's assume extrinsic stays roughly constant for small moves today
    const requiredIntrinsic = Math.max(targetLTP - targetExtrinsic, 0);
    const requiredSpotPrice = isCall ? strike + requiredIntrinsic : strike - requiredIntrinsic;

    const spotChange = requiredSpotPrice - spotPrice;
    const spotChangePercent = (spotChange / spotPrice) * 100;

    // Generate Price Sensitivity Curve data
    const priceCurve = [];
    const spotRange = spotPrice * 0.05; // +/- 5%
    for (let i = spotPrice - spotRange; i <= spotPrice + spotRange; i += spotRange / 20) {
        // Simplified BS model proxy for curve shape
        const intr = isCall ? Math.max(i - strike, 0) : Math.max(strike - i, 0);
        // Extrinsic value peaks at ATM
        const atmDistance = Math.abs(i - strike);
        const extr = Math.max(100 - (atmDistance * 0.2), 0) * (impliedVolatility * 10);
        priceCurve.push({ spot: i, price: intr + extr });
    }

    const greeks = {
        delta: isCall ? 0.45 : -0.45,
        gamma: 0.002,
        theta: -8.5,
        vega: 12.4
    };

    // Format HMM graph payload Data
    const formattedHistory = regimeHistory && !regimeHistory.error ? regimeHistory.map((d: any) => ({
        ...d,
        // Using correct struct properties from backend!
        p90: d.p90,
        p75: d.p75,
        p25: d.p25,
        p10: d.p10,
        scenarioBull: d.scenarioBull,
        scenarioBear: d.scenarioBear,
        regimeName: d.regime === 0 ? "BULL" : d.regime === 1 ? "BEAR" : d.regime === 2 ? "CHOPPY" : "UNKNOWN"
    })) : [];

    const activeRegime = hmmData && hmmData.regime ? hmmData.regime : 'OFFLINE';
    const confidence = hmmData && hmmData.confidence ? (hmmData.confidence * 100).toFixed(1) : '0';

    const getRegimeColor = (regime: string) => {
        if (regime === 'BULL') return 'from-emerald-900/50 to-emerald-600/20 border-emerald-500/30';
        if (regime === 'BEAR') return 'from-rose-900/50 to-rose-600/20 border-rose-500/30';
        if (regime === 'CHOPPY') return 'from-amber-900/50 to-amber-600/20 border-amber-500/30';
        return 'from-slate-900/50 to-slate-600/20 border-slate-500/30';
    };

    const getRegimeTextColor = (regime: string) => {
        if (regime === 'BULL') return 'text-emerald-400';
        if (regime === 'BEAR') return 'text-rose-400';
        if (regime === 'CHOPPY') return 'text-amber-400';
        return 'text-slate-400';
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            // Filter out the structural array bounds `[p10, p90]`
            const visiblePayloads = payload.filter((p: any) => !Array.isArray(p.value));

            return (
                <div className="bg-slate-900/90 border border-slate-700 p-3 rounded-lg shadow-xl backdrop-blur-md">
                    <p className="text-slate-300 font-medium mb-2">{label}</p>
                    {visiblePayloads.map((entry: any, index: number) => {
                        let displayName = entry.name;
                        const val = Number(entry.value).toFixed(2);
                        let color = entry.color || '#fff';

                        // Check if it's the scenario paths or main lines
                        if (entry.dataKey === 'close') {
                            displayName = 'Price';
                            color = '#e2e8f0';
                        }
                        return (
                            <p key={`item-${index}`} style={{ color }} className="text-sm flex justify-between gap-4">
                                <span>{displayName}:</span>
                                <span className="font-mono font-bold">{val}</span>
                            </p>
                        );
                    })}
                </div>
            );
        }
        return null;
    };


    return (
        <main className="min-h-screen bg-[#020617] text-slate-200 p-4 md:p-8 font-sans selection:bg-indigo-500/30">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent flex items-center">
                        <BrainCircuit className="w-8 h-8 mr-3 text-indigo-400" />
                        Quant Assessment V2
                    </h1>
                    <p className="text-slate-400 mt-2 text-sm flex items-center">
                        <Activity className="w-4 h-4 mr-1" />
                        Live Multi-Regime Forward Projections & Target Inference
                    </p>
                </div>
                <div className="flex space-x-3">
                    <button onClick={runBacktest} disabled={isBacktesting} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-full font-medium transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_25px_rgba(79,70,229,0.5)] flex items-center text-sm">
                        {isBacktesting ? <span className="animate-spin mr-2">◒</span> : <Layers className="w-4 h-4 mr-2" />}
                        Run Strategy
                    </button>
                    {!isMarketOpen && (
                        <div className="bg-rose-500/20 border border-rose-500/30 text-rose-400 px-4 py-2 rounded-full font-medium flex items-center text-sm">
                            <ShieldAlert className="w-4 h-4 mr-2" /> Market Closed
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* Left Column - Active Engine & Market Context */}
                <div className="xl:col-span-1 space-y-6">

                    {/* Regime Status Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`bg-gradient-to-br border rounded-3xl p-6 ${getRegimeColor(activeRegime)} relative overflow-hidden`}
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <BrainCircuit className="w-32 h-32" />
                        </div>
                        <h2 className="text-sm font-bold text-slate-300 mb-1 flex items-center uppercase tracking-wider">
                            Current ML Regime
                        </h2>
                        <div className="flex items-end justify-between relative z-10">
                            <div>
                                <h3 className={`text-4xl font-black mt-2 ${getRegimeTextColor(activeRegime)} drop-shadow-md`}>
                                    {activeRegime}
                                </h3>
                                <p className="text-sm mt-2 font-medium opacity-80 flex items-center">
                                    <Target className="w-4 h-4 mr-1" />
                                    Model Confidence: <span className="ml-1 font-mono font-bold">{confidence}%</span>
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Paper Trading Execution Console */}
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-3xl p-6 backdrop-blur-md">
                        <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center uppercase tracking-wider">
                            <Zap className="w-4 h-4 mr-2 text-amber-400" /> Forward Order Execution
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-500 mb-1 block">Active Asset Contract</label>
                                <input
                                    type="text"
                                    value={assetName}
                                    onChange={(e) => setAssetName(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm font-mono text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button
                                    onClick={() => executePaperTrade('BUY', 'QUANT', currentLTP)}
                                    className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 py-3 rounded-xl font-bold flex justify-center items-center transition-all group"
                                >
                                    <span className="transform group-hover:-translate-y-1 transition-transform">BUY QUANT</span>
                                </button>
                                <button
                                    onClick={() => executePaperTrade('SELL', 'QUANT', currentLTP)}
                                    className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 py-3 rounded-xl font-bold flex justify-center items-center transition-all group"
                                >
                                    <span className="transform group-hover:translate-y-1 transition-transform">SELL QUANT</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Active Paper Trades */}
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-3xl p-6 backdrop-blur-md flex-1">
                        <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center uppercase tracking-wider">
                            <BookOpen className="w-4 h-4 mr-2 text-cyan-400" /> Open Paper Ledger
                        </h3>

                        {isLoading ? (
                            <div className="animate-pulse space-y-3">
                                <div className="h-12 bg-slate-700/50 rounded-xl"></div>
                                <div className="h-12 bg-slate-700/50 rounded-xl"></div>
                            </div>
                        ) : paperData?.trades?.filter((t: any) => t.status === 'OPEN').length > 0 ? (
                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {paperData.trades.filter((t: any) => t.status === 'OPEN').map((trade: any) => (
                                    <div key={trade.id} className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-3 flex justify-between items-center text-sm">
                                        <div>
                                            <span className={`font-bold mr-2 ${trade.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {trade.direction}
                                            </span>
                                            <span className="font-mono text-slate-300 text-xs">{trade.assetName}</span>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono">{trade.qty} @ ₹{trade.entryPrice.toFixed(2)}</div>
                                            <div className={`font-bold font-mono ${trade.pl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {trade.pl >= 0 ? '+' : ''}₹{trade.pl.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-slate-500 text-sm border-2 border-dashed border-slate-700 rounded-xl">
                                No open positions
                            </div>
                        )}
                    </div>

                </div>

                {/* Right Area - Analytics & Charts */}
                <div className="xl:col-span-2 space-y-6">

                    {/* HMM Price Projection Fan Chart */}
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-3xl p-6 backdrop-blur-md">
                        <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center uppercase tracking-wider">
                            <LineChartIcon className="w-4 h-4 mr-2 text-indigo-400" /> Regime History & Forward Cone
                        </h3>
                        <div className="h-[400px] w-full">
                            {!regimeHistory ? (
                                <div className="w-full h-full flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                                </div>
                            ) : formattedHistory.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={formattedHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            stroke="rgba(255,255,255,0.2)"
                                            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => val.split('-').slice(1).join('/')}
                                        />
                                        <YAxis
                                            domain={['auto', 'auto']}
                                            stroke="rgba(255,255,255,0.2)"
                                            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => `₹${val}`}
                                        />
                                        <Tooltip content={<CustomTooltip />} />

                                        {/* Outer Confidence Band (10th to 90th percentile) */}
                                        <Area
                                            type="monotone"
                                            dataKey={([p10, p90]) => [p10, p90]}
                                            fill="#1e293b"
                                            stroke="none"
                                            opacity={0.3}
                                        />

                                        {/* Inner Confidence Band (25th to 75th percentile) */}
                                        <Area
                                            type="monotone"
                                            dataKey={([p25, p75]) => [p25, p75]}
                                            fill="#334155"
                                            stroke="none"
                                            opacity={0.5}
                                        />

                                        {/* The Actual Historical Price / Median Projection Line */}
                                        <Line
                                            type="monotone"
                                            dataKey="close"
                                            stroke="#e2e8f0"
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 6, fill: '#e2e8f0', stroke: '#0f172a', strokeWidth: 2 }}
                                        />

                                        {/* Bull Scenario Path (Dotted) */}
                                        <Line
                                            type="monotone"
                                            dataKey="scenarioBull"
                                            stroke="#10b981"
                                            strokeWidth={2}
                                            strokeDasharray="5 5"
                                            dot={false}
                                            name="Bull Scenario"
                                        />

                                        {/* Bear Scenario Path (Dotted) */}
                                        <Line
                                            type="monotone"
                                            dataKey="scenarioBear"
                                            stroke="#f43f5e"
                                            strokeWidth={2}
                                            strokeDasharray="5 5"
                                            dot={false}
                                            name="Bear Scenario"
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm border border-slate-800 rounded-xl">
                                    No regime data available. Market might be closed or API is initializing.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* V2 Dynamic Target Inference & Greeks UI (Integrated vertically) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Greeks Snapshot (Mocked for now, waiting for Python Engine V2) */}
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-3xl p-6 backdrop-blur-md">
                            <h3 className="text-sm font-bold text-slate-300 flex items-center uppercase tracking-wider mb-6">
                                <Sigma className="w-4 h-4 mr-2 text-cyan-400" /> Live Target Spot Inference
                            </h3>

                            <div className="flex items-center mb-6">
                                <span className="text-4xl font-black text-slate-100 mr-2 font-mono drop-shadow-md">₹{spotPrice}</span>
                                <span className="text-sm text-slate-400">Current NIFTY Spot</span>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-xs text-slate-400 font-medium mb-1">
                                        <span>Target Premium (₹)</span>
                                        <span>₹{targetLTP}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="10" max="500" step="5"
                                        value={targetLTP}
                                        onChange={(e) => setTargetLTP(Number(e.target.value))}
                                        className="w-full accent-indigo-500"
                                    />
                                </div>
                                <div className="pt-2 border-t border-slate-700/50">
                                    <div className="flex justify-between items-center text-sm py-2">
                                        <span className="text-slate-400">Required Spot Movement</span>
                                        <span className={`font-mono font-bold ${spotChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {spotChange >= 0 ? '+' : ''}{spotChange.toFixed(2)} ({spotChangePercent.toFixed(2)}%)
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm py-2">
                                        <span className="text-slate-400">Required Target Spot Level</span>
                                        <span className="font-mono font-bold text-slate-200">
                                            ₹{requiredSpotPrice.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Additional Module space for Backtest Results or Greeks */}
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-3xl p-6 backdrop-blur-md">
                            <h3 className="text-sm font-bold text-slate-300 flex items-center uppercase tracking-wider mb-4">
                                <Layers className="w-4 h-4 mr-2 text-indigo-400" /> Greeks & Strategy Edge
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700/30 text-center">
                                    <div className="text-xs text-slate-500 font-medium mb-1">Delta (Δ)</div>
                                    <div className="font-mono font-bold text-emerald-400">{greeks.delta.toFixed(3)}</div>
                                </div>
                                <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700/30 text-center">
                                    <div className="text-xs text-slate-500 font-medium mb-1">Theta (Θ)</div>
                                    <div className="font-mono font-bold text-rose-400">{greeks.theta.toFixed(2)}</div>
                                </div>
                                <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700/30 text-center relative col-span-2">
                                    <div className="text-xs text-slate-400 font-bold mb-1">Trade Assessment</div>
                                    <div className="text-sm text-slate-300">
                                        HMM momentum aligns with target.
                                        Probability of hit: <span className="text-emerald-400 font-bold ml-1">{Math.min(95, Math.abs(greeks.delta) * 100 * 1.5).toFixed(0)}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </main>
    );
}
