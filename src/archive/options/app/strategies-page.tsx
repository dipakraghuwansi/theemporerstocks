"use client";

import { useState, useMemo, useEffect } from 'react';
import { Layers, Plus, Trash2, Activity, Rocket, CheckCircle2, AlertCircle, X, RefreshCw, Info } from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    ReferenceDot
} from 'recharts';
import AsyncSelect from 'react-select/async';
import { OptionLeg, calculateCombinedPayoff, OptionType, OptionPosition } from '@/lib/blackScholes';

export default function StrategyBuilder() {
    const [underlyingSpot, setUnderlyingSpot] = useState(25713);
    const [isLoadingATM, setIsLoadingATM] = useState(false);

    // Dynamic Option Legs State
    const [legs, setLegs] = useState<OptionLeg[]>([
        {
            id: crypto.randomUUID(),
            assetName: 'NFO:NIFTY24OCT25600CE',
            optionType: 'CE',
            position: 'BUY',
            strikePrice: 25600,
            lotSize: 25,
            numLots: 1,
            entryPrice: 150,
            currentLTP: 150,
            expiry: '2024-10-24'
        },
        {
            id: crypto.randomUUID(),
            assetName: 'NFO:NIFTY24OCT25600PE',
            optionType: 'PE',
            position: 'BUY',
            strikePrice: 25600,
            lotSize: 25,
            numLots: 1,
            entryPrice: 120,
            currentLTP: 120,
            expiry: '2024-10-24'
        }
    ]);
    const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
    const [isFetchingMargins, setIsFetchingMargins] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);
    const [availableMargin, setAvailableMargin] = useState<number | null>(null);
    const [deploymentStatus, setDeploymentStatus] = useState<{ type: 'none' | 'success' | 'partial' | 'error', msg: string }>({ type: 'none', msg: '' });
    const [minDaysToExpiry, setMinDaysToExpiry] = useState<number>(3);
    const [monthlyOnly, setMonthlyOnly] = useState<boolean>(false);
    const [marketAnalysis, setMarketAnalysis] = useState<any>(null);

    const handlePreExecuteCheck = async () => {
        setIsFetchingMargins(true);
        setDeploymentStatus({ type: 'none', msg: '' });
        setIsDeployModalOpen(true);

        try {
            const resp = await fetch('/api/kite/margins');
            if (resp.ok) {
                const data = await resp.json();
                if (data.data) {
                    setAvailableMargin(data.data.available || data.data.cash || 0);
                }
            } else {
                setAvailableMargin(0);
                if (resp.status === 401) {
                    setDeploymentStatus({ type: 'error', msg: 'Not connected to Kite. Please log in from the main calculator.' });
                }
            }
        } catch (e) {
            console.error("Failed to fetch margins", e);
            setAvailableMargin(0);
        }
        setIsFetchingMargins(false);
    };

    const confirmDeployment = async () => {
        setIsDeploying(true);
        try {
            const resp = await fetch('/api/kite/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ legs })
            });
            const data = await resp.json();

            if (resp.ok) {
                setDeploymentStatus({ type: 'success', msg: data.message });
            } else if (resp.status === 207) {
                setDeploymentStatus({ type: 'partial', msg: data.message + '. Check specific leg statuses.' });
            } else {
                setDeploymentStatus({ type: 'error', msg: data.error || 'Failed to execute orders' });
            }
        } catch (e: any) {
            setDeploymentStatus({ type: 'error', msg: e.message || 'Network error executing orders' });
        }
        setIsDeploying(false);
    };

    const loadOptions = async (inputValue: string) => {
        if (!inputValue || inputValue.length < 3) return [];
        try {
            const resp = await fetch(`/api/instruments?q=${encodeURIComponent(inputValue)}`);
            const payload = await resp.json();
            return payload.data || [];
        } catch (err) {
            console.error('Failed fetching instruments', err);
            return [];
        }
    };

    // Auto-fetch Live Nifty Spot Index on component mount and every 10 seconds
    useEffect(() => {
        let isMounted = true;
        const fetchSpot = async () => {
            try {
                const spotResp = await fetch('/api/quote?instrument=NSE:NIFTY+50');
                if (spotResp.ok) {
                    const spotData = await spotResp.json();
                    if (spotData.data && isMounted) {
                        setUnderlyingSpot(spotData.data.last_price);
                    }
                }
            } catch (err) {
                console.error("Failed auto-fetching live spot", err);
            }
        };

        // Fetch immediately once
        fetchSpot();

        // Then poll every 5 seconds for SPOT only. Analysis is historical, fetch once.
        const intervalId = setInterval(fetchSpot, 5000);

        // Fetch Market Quantitative Analysis
        const fetchAnalysis = async () => {
            try {
                const analysisResp = await fetch('/api/analysis');
                if (analysisResp.ok) {
                    const analysisData = await analysisResp.json();
                    if (analysisData.success && isMounted) {
                        setMarketAnalysis(analysisData.data);
                    }
                }
            } catch (err) {
                console.error("Failed fetching market analysis", err);
            }
        };
        fetchAnalysis();

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, []);

    const addLeg = () => {
        setLegs([...legs, {
            id: crypto.randomUUID(),
            assetName: '',
            optionType: 'CE',
            position: 'BUY',
            strikePrice: 0,
            lotSize: 25,
            numLots: 1,
            entryPrice: 0,
            currentLTP: 0,
            expiry: ''
        }]);
    };

    const removeLeg = (id: string) => {
        setLegs(legs.filter(leg => leg.id !== id));
    };

    const updateLeg = (id: string, field: keyof OptionLeg, value: any) => {
        setLegs(legs => legs.map(leg => leg.id === id ? { ...leg, [field]: value } : leg));
    };

    const autoLoadATMStraddle = async () => {
        setIsLoadingATM(true);
        try {
            // 1. Fetch live Nifty Spot
            let spot = underlyingSpot;
            const spotResp = await fetch('/api/quote?instrument=NSE:NIFTY+50');
            if (spotResp.ok) {
                const spotData = await spotResp.json();
                if (spotData.data) {
                    spot = spotData.data.last_price;
                    setUnderlyingSpot(spot);
                }
            }

            // 2. Calculate ATM Strike
            const atmStrike = Math.round(spot / 50) * 50;

            // 3. Find matching instrument symbols
            const ceOptionsRaw = await loadOptions(`NIFTY ${atmStrike} CE`);
            const peOptionsRaw = await loadOptions(`NIFTY ${atmStrike} PE`);

            // Sort options by expiry date to pick the nearest upcoming one
            const targetTime = new Date();
            targetTime.setDate(targetTime.getDate() + minDaysToExpiry);
            targetTime.setHours(0, 0, 0, 0);

            const getNearestOption = (options: any[]) => {
                let validOptions = options.filter(o => o.expiry && new Date(o.expiry).getTime() >= targetTime.getTime());
                if (monthlyOnly) validOptions = validOptions.filter(o => o.isMonthly);

                // Fallback to absolute nearest if no options match the min days criteria
                let fallbackOptions = options.filter(o => o.expiry && new Date(o.expiry).getTime() >= new Date().setHours(0, 0, 0, 0));
                if (monthlyOnly) fallbackOptions = fallbackOptions.filter(o => o.isMonthly);

                const optionsToUse = validOptions.length > 0 ? validOptions : fallbackOptions;

                return optionsToUse.sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime())[0];
            };

            const ceOption = getNearestOption(ceOptionsRaw) || ceOptionsRaw[0];
            const peOption = getNearestOption(peOptionsRaw) || peOptionsRaw[0];

            const ceSymbol = ceOption?.value || '';
            const ceExpiry = ceOption?.expiry || '';
            const ceLotSize = ceOption?.lotSize || 25;

            const peSymbol = peOption?.value || '';
            const peExpiry = peOption?.expiry || '';
            const peLotSize = peOption?.lotSize || 25;

            // 4. Fetch Live Premium (LTP)
            let ceLTP = 0;
            let peLTP = 0;

            if (ceSymbol) {
                const ceResp = await fetch(`/api/quote?instrument=${encodeURIComponent(ceSymbol)}`);
                if (ceResp.ok) {
                    const ceData = await ceResp.json();
                    if (ceData.data) ceLTP = ceData.data.last_price;
                }
            }
            if (peSymbol) {
                const peResp = await fetch(`/api/quote?instrument=${encodeURIComponent(peSymbol)}`);
                if (peResp.ok) {
                    const peData = await peResp.json();
                    if (peData.data) peLTP = peData.data.last_price;
                }
            }

            // 5. Override Legs state
            setLegs([
                {
                    id: crypto.randomUUID(),
                    assetName: ceSymbol,
                    optionType: 'CE',
                    position: 'BUY',
                    strikePrice: atmStrike,
                    lotSize: ceLotSize,
                    numLots: 1,
                    entryPrice: ceLTP || 150,
                    currentLTP: ceLTP || 150,
                    expiry: ceExpiry
                },
                {
                    id: crypto.randomUUID(),
                    assetName: peSymbol,
                    optionType: 'PE',
                    position: 'BUY',
                    strikePrice: atmStrike,
                    lotSize: peLotSize,
                    numLots: 1,
                    entryPrice: peLTP || 120,
                    currentLTP: peLTP || 120,
                    expiry: peExpiry
                }
            ]);

        } catch (e) {
            console.error("Failed to auto-load ATM Straddle", e);
        }
        setIsLoadingATM(false);
    };

    // Generate Matrix
    const payoffMatrix = useMemo(() => {
        // Zoom range: +/- 5% around current spot
        const minSpot = underlyingSpot * 0.95;
        const maxSpot = underlyingSpot * 1.05;
        return calculateCombinedPayoff(legs, minSpot, maxSpot, 10);
    }, [legs, underlyingSpot]);

    // Aggregate Metrics Calculations
    let totalPremiumPaid = 0;
    let totalPremiumReceived = 0;

    legs.forEach(leg => {
        const value = leg.entryPrice * leg.lotSize * leg.numLots;
        if (leg.position === 'BUY') totalPremiumPaid += value;
        if (leg.position === 'SELL') totalPremiumReceived += value;
    });

    const maxLoss = Math.min(...payoffMatrix.map(p => p.netPayoff));
    const maxProfit = Math.max(...payoffMatrix.map(p => p.netPayoff));
    const isLossInfinite = maxLoss < -100000; // rough heuristic for naked short calls
    const isProfitInfinite = maxProfit > 100000;

    const fNum = (num: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(num);

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 selection:bg-sky-500/30 font-sans pb-32">
            {/* Background gradients */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-600/10 rounded-full blur-[128px]"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-[128px]"></div>
            </div>

            <div className="w-full max-w-7xl mx-auto relative z-10 space-y-8">

                <div className="text-center space-y-4 pt-4">
                    <div className="inline-flex items-center justify-center p-3 bg-white/5 rounded-2xl border border-white/10 mb-4 shadow-xl">
                        <Layers className="w-8 h-8 text-sky-400" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-sky-300 via-white to-emerald-300">
                        Strategy Builder
                    </h1>
                    <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                        Combine multiple Option Legs to architect advanced hedged setups like Straddles, Iron Condors, and Spreads.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-12">

                    {/* Left Panel: The Legs Builder */}
                    <div className="lg:col-span-5 space-y-6">

                        {/* Market Analysis Banner */}
                        {marketAnalysis && (
                            <div className="bg-gradient-to-r from-indigo-900/40 to-indigo-950/40 border border-indigo-500/20 rounded-3xl p-5 backdrop-blur-xl relative transition-all duration-300 hover:border-indigo-500/40">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <Activity className="w-24 h-24" />
                                </div>
                                <h3 className="text-[10px] uppercase font-bold text-indigo-400 tracking-widest mb-3 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    Live Quantitative Assessment
                                </h3>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <p className="text-xs text-slate-400">Trend Bias</p>
                                        <p className={`text-sm font-bold ${marketAnalysis.analysis.trendBias.includes('BULL') ? 'text-emerald-400' : marketAnalysis.analysis.trendBias.includes('BEAR') ? 'text-rose-400' : 'text-sky-400'}`}>
                                            {marketAnalysis.analysis.trendBias}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-slate-400">Volatility Risk</p>
                                        <p className="text-sm font-bold text-indigo-300">
                                            {marketAnalysis.analysis.volatilityBias} ({marketAnalysis.indicators.historicalVolatility20}%)
                                        </p>
                                    </div>
                                    <div className="col-span-2 pt-2 border-t border-white/5 relative group">
                                        <div className="flex items-center gap-1.5 cursor-help w-max">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">Engine Recommendation</p>
                                            <Info className="w-3 h-3 text-slate-500" />
                                        </div>

                                        {/* CSS Hover Tooltip */}
                                        <div className="absolute left-0 bottom-full mb-2 w-[280px] sm:w-[320px] p-3 md:p-4 bg-slate-800 text-xs text-slate-300 rounded-xl border border-white/10 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                                            <strong className="text-white block mb-1">How is this calculated?</strong>
                                            The Engine analyzes the <strong>20-Day Annualized Historical Volatility (HV)</strong> of the underlying index based on daily close prices.
                                            <ul className="list-disc pl-4 mt-2 space-y-1">
                                                <li><strong>HV &gt; 20%:</strong> High Volatility. Suggests selling premium (Iron Condors).</li>
                                                <li><strong>HV &lt; 12%:</strong> Low Volatility. Suggests buying breakouts (Strangles).</li>
                                                <li><strong>Otherwise:</strong> Neutral/Directional Spreads.</li>
                                            </ul>
                                            <div className="absolute -bottom-2 left-6 w-4 h-4 bg-slate-800 border-b border-r border-white/10 rotate-45 transform"></div>
                                        </div>

                                        <p className="text-sm font-medium text-white mt-1">
                                            {marketAnalysis.analysis.suggestedStrategy}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl mb-6">
                            <div className="flex flex-wrap justify-between items-end gap-6">
                                <div className="w-full sm:w-auto flex-1 min-w-[200px]">
                                    <label className="text-sm font-medium text-slate-400 mb-2 block">Nifty Current Spot Index</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-3.5 text-slate-500">₹</span>
                                        <input
                                            type="number"
                                            value={underlyingSpot}
                                            onChange={e => setUnderlyingSpot(Number(e.target.value))}
                                            className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-8 pr-4 py-3 outline-none focus:border-sky-500 text-xl font-bold transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col items-start sm:items-end gap-3 w-full sm:w-auto flex-1 min-w-[250px]">
                                    <div className="flex flex-col gap-1 w-full items-start sm:items-end">
                                        <div className="flex items-center justify-between w-full">
                                            <div className="flex items-center gap-4">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                    Time-Stop (Min Days to Expiry)
                                                </label>
                                            </div>
                                            <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded-full ml-2 border border-white/5">
                                                {minDaysToExpiry} Days
                                            </span>
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer mt-1 group">
                                            <input
                                                type="checkbox"
                                                checked={monthlyOnly}
                                                onChange={(e) => setMonthlyOnly(e.target.checked)}
                                                className="w-3.5 h-3.5 rounded bg-slate-900 border-white/20 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer"
                                            />
                                            <span className="text-[10px] font-bold text-emerald-400/80 group-hover:text-emerald-400 uppercase tracking-widest transition-colors">
                                                Monthly Expiries Only
                                            </span>
                                        </label>
                                    </div>
                                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 w-full mt-2">
                                        <input
                                            type="range"
                                            min="0"
                                            max="45"
                                            value={minDaysToExpiry}
                                            onChange={(e) => setMinDaysToExpiry(Number(e.target.value))}
                                            className="w-full flex-1 min-w-[100px] accent-sky-500 cursor-pointer"
                                        />
                                        <button
                                            onClick={autoLoadATMStraddle}
                                            disabled={isLoadingATM}
                                            className="text-sm w-full sm:w-auto bg-sky-500/20 text-sky-400 hover:bg-sky-500/40 px-5 py-2.5 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center whitespace-nowrap"
                                        >
                                            {isLoadingATM ? 'Loading...' : 'Auto-Load ATM Straddle'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {legs.map((leg, i) => (
                                <div key={leg.id} className="bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden shadow-2xl relative group">

                                    {/* Banner indicating Buy/Sell and Type */}
                                    <div className={`h-2 w-full ${leg.position === 'BUY' ? 'bg-sky-500' : 'bg-rose-500'}`}></div>

                                    <div className="p-5 space-y-4">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm font-bold text-slate-300">Leg {i + 1}</span>
                                            <button onClick={() => removeLeg(leg.id)} className="text-slate-500 hover:text-rose-400 p-1 transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* Position and Type Toggles */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex bg-slate-950/50 p-1 rounded-xl border border-white/10">
                                                <button
                                                    onClick={() => updateLeg(leg.id, 'position', 'BUY')}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${leg.position === 'BUY' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}
                                                >BUY</button>
                                                <button
                                                    onClick={() => updateLeg(leg.id, 'position', 'SELL')}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${leg.position === 'SELL' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'}`}
                                                >SELL</button>
                                            </div>

                                            <div className="flex bg-slate-950/50 p-1 rounded-xl border border-white/10">
                                                <button
                                                    onClick={() => updateLeg(leg.id, 'optionType', 'CE')}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${leg.optionType === 'CE' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'}`}
                                                >CE</button>
                                                <button
                                                    onClick={() => updateLeg(leg.id, 'optionType', 'PE')}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${leg.optionType === 'PE' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'}`}
                                                >PE</button>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <AsyncSelect
                                                instanceId={`leg-select-${leg.id}`}
                                                cacheOptions
                                                loadOptions={loadOptions}
                                                value={leg.assetName ? { label: leg.assetName, value: leg.assetName } : null}
                                                onChange={(option: any) => {
                                                    updateLeg(leg.id, 'assetName', option?.value || '');

                                                    if (option?.expiry) {
                                                        updateLeg(leg.id, 'expiry', option.expiry);
                                                    }
                                                    if (option?.lotSize) {
                                                        updateLeg(leg.id, 'lotSize', option.lotSize);
                                                    }

                                                    if (option?.value) {
                                                        const match = option.value.match(/(\d+)(CE|PE)$/i);
                                                        if (match) {
                                                            updateLeg(leg.id, 'strikePrice', Number(match[1]));
                                                            updateLeg(leg.id, 'optionType', match[2].toUpperCase() as OptionType);
                                                        }
                                                    }
                                                }}
                                                placeholder="Search Instrument..."
                                                styles={{
                                                    control: (base) => ({
                                                        ...base,
                                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                                        borderColor: 'rgba(255, 255, 255, 0.1)',
                                                        borderRadius: '0.75rem',
                                                    }),
                                                    input: (base) => ({ ...base, color: 'white' }),
                                                    singleValue: (base) => ({ ...base, color: 'white' }),
                                                    menu: (base) => ({
                                                        ...base,
                                                        backgroundColor: '#0f172a',
                                                        border: '1px solid rgba(255, 255, 255, 0.1)'
                                                    }),
                                                    option: (base, state) => ({
                                                        ...base,
                                                        backgroundColor: state.isFocused ? '#1e293b' : 'transparent',
                                                        color: 'white',
                                                        cursor: 'pointer'
                                                    })
                                                }}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Strike</label>
                                                <input
                                                    type="number"
                                                    value={leg.strikePrice}
                                                    onChange={e => updateLeg(leg.id, 'strikePrice', Number(e.target.value))}
                                                    className="w-full bg-slate-950/50 border border-white/5 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500 font-mono"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Premium</label>
                                                <input
                                                    type="number"
                                                    value={leg.entryPrice}
                                                    onChange={e => updateLeg(leg.id, 'entryPrice', Number(e.target.value))}
                                                    className="w-full bg-slate-950/50 border border-white/5 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500 font-mono"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Lots</label>
                                                <input
                                                    type="number"
                                                    value={leg.numLots}
                                                    onChange={e => updateLeg(leg.id, 'numLots', Number(e.target.value))}
                                                    className="w-full bg-slate-950/50 border border-white/5 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500 font-mono"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Lot Size</label>
                                                <input
                                                    type="number"
                                                    value={leg.lotSize}
                                                    onChange={e => updateLeg(leg.id, 'lotSize', Number(e.target.value))}
                                                    className="w-full bg-slate-950/50 border border-white/5 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500 text-slate-400 font-mono"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase tracking-wider font-bold text-indigo-400">Target (₹)</label>
                                                <input
                                                    type="number"
                                                    value={leg.targetProfit === undefined ? '' : leg.targetProfit}
                                                    onChange={e => updateLeg(leg.id, 'targetProfit', e.target.value === '' ? undefined : Number(e.target.value))}
                                                    placeholder="Optional"
                                                    className="w-full bg-indigo-950/20 border border-indigo-500/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 text-indigo-100 font-mono placeholder:text-indigo-900/50"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] uppercase tracking-wider font-bold text-rose-400">Stop Loss (₹)</label>
                                                <input
                                                    type="number"
                                                    value={leg.stopLoss === undefined ? '' : leg.stopLoss}
                                                    onChange={e => updateLeg(leg.id, 'stopLoss', e.target.value === '' ? undefined : Number(e.target.value))}
                                                    placeholder="Optional"
                                                    className="w-full bg-rose-950/20 border border-rose-500/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-rose-500 text-rose-100 font-mono placeholder:text-rose-900/50"
                                                />
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={addLeg}
                            className="w-full py-4 border-2 border-dashed border-white/10 rounded-3xl text-slate-400 font-bold hover:bg-white/5 hover:text-white hover:border-sky-500/50 transition-all flex items-center justify-center gap-2"
                        >
                            <Plus className="w-5 h-5" /> Add Option Leg
                        </button>

                    </div>

                    {/* Right Panel: Payoff Graph & Summation */}
                    <div className="lg:col-span-7 flex flex-col gap-6">

                        {/* Aggregate Metrics Header */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl p-6">
                                <p className="text-sm text-slate-400 font-medium mb-1">Max Profit</p>
                                <p className={`text-3xl font-bold font-mono ${isProfitInfinite ? 'text-emerald-400' : (maxProfit > 0 ? 'text-emerald-400' : 'text-slate-300')}`}>
                                    {isProfitInfinite ? 'Unlimited' : `₹${fNum(maxProfit)}`}
                                </p>
                            </div>
                            <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl p-6">
                                <p className="text-sm text-slate-400 font-medium mb-1">Max Loss</p>
                                <p className={`text-3xl font-bold font-mono ${isLossInfinite ? 'text-rose-400' : (maxLoss < 0 ? 'text-rose-400' : 'text-slate-300')}`}>
                                    {isLossInfinite ? 'Unlimited' : `₹${fNum(Math.abs(maxLoss))}`}
                                </p>
                            </div>
                        </div>

                        {/* Payoff Chart */}
                        <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 backdrop-blur-xl h-[450px] flex flex-col">
                            <h3 className="text-sm font-bold mb-4 flex items-center text-slate-300">
                                <Activity className="w-4 h-4 mr-2 text-sky-400" /> Expiration Payoff Matrix
                            </h3>

                            <div className="flex-1 w-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={payoffMatrix} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#34d399" stopOpacity={0.0} />
                                            </linearGradient>
                                            <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#fb7185" stopOpacity={0.0} />
                                                <stop offset="95%" stopColor="#fb7185" stopOpacity={0.3} />
                                            </linearGradient>
                                        </defs>

                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />

                                        <XAxis
                                            dataKey="spot"
                                            type="number"
                                            domain={['dataMin', 'dataMax']}
                                            tickFormatter={(v) => Math.round(v).toString()}
                                            stroke="rgba(255,255,255,0.2)"
                                            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />

                                        <YAxis
                                            stroke="rgba(255,255,255,0.2)"
                                            tickFormatter={(v) => `₹${Math.round(v)}`}
                                            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 12 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />

                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                            itemStyle={{ color: '#bae6fd', fontWeight: 'bold' }}
                                            labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                                            formatter={(value: any) => {
                                                const v = Number(value);
                                                return [
                                                    <span key="value" style={{ color: v >= 0 ? '#34d399' : '#fb7185' }}>
                                                        ₹{v.toFixed(2)}
                                                    </span>,
                                                    'Net Profit/Loss'
                                                ];
                                            }}
                                            labelFormatter={(label: any) => `Spot at Expiry: ₹${Number(label).toFixed(2)}`}
                                        />

                                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeWidth={2} />
                                        <ReferenceLine x={underlyingSpot} stroke="#38bdf8" strokeDasharray="3 3" opacity={0.5} label={{ position: 'top', value: 'CMT', fill: '#38bdf8', fontSize: 10 }} />

                                        {/* We use two areas, but the simplest way in Recharts to split color at zero is a single line with gradient, or SVG clipping. For MVP, we'll draw one line and shade it. */}
                                        <Area
                                            type="monotone"
                                            dataKey="netPayoff"
                                            stroke="#e2e8f0"
                                            strokeWidth={4}
                                            fill="url(#colorProfit)"
                                            activeDot={{ r: 6, fill: '#38bdf8', stroke: '#0f172a', strokeWidth: 2 }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Sub-Metrics */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                                <span className="text-sm text-slate-400">Total Premium Paid</span>
                                <span className="font-mono font-bold text-rose-400">₹{fNum(totalPremiumPaid)}</span>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                                <span className="text-sm text-slate-400">Total Premium Received</span>
                                <span className="font-mono font-bold text-emerald-400">₹{fNum(totalPremiumReceived)}</span>
                            </div>
                            {/* Deploy Button */}
                            <button
                                onClick={handlePreExecuteCheck}
                                disabled={legs.length === 0}
                                className="col-span-2 w-full mt-4 bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-white font-bold py-4 rounded-3xl shadow-lg hover:shadow-sky-500/25 transition-all flex items-center justify-center gap-2 transform active:scale-[0.98]"
                            >
                                <Rocket className="w-5 h-5" /> Execute Live Strategy
                            </button>
                        </div>

                    </div>

                </div>

            </div>

            {/* Dynamic Order Placement Modal */}
            {isDeployModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => !isDeploying ? setIsDeployModalOpen(false) : null}></div>

                    <div className="bg-slate-900 border border-white/10 p-6 rounded-3xl shadow-2xl w-full max-w-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                <Rocket className="w-6 h-6 text-sky-400" /> Confirm Deployment
                            </h2>
                            {!isDeploying && (
                                <button onClick={() => setIsDeployModalOpen(false)} className="text-slate-400 hover:text-white p-2 bg-white/5 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        {/* Status Messages */}
                        {deploymentStatus.type !== 'none' && (
                            <div className={`p-4 rounded-xl mb-6 font-medium flex items-center gap-3 ${deploymentStatus.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                deploymentStatus.type === 'partial' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                    'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                }`}>
                                {deploymentStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                {deploymentStatus.msg}
                            </div>
                        )}

                        <div className="space-y-6">

                            {/* Margin Check Banner */}
                            <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 flex justify-between items-center">
                                <div>
                                    <p className="text-sm text-slate-400">Available Cash Margin</p>
                                    {isFetchingMargins ? (
                                        <div className="h-6 w-24 bg-slate-800 animate-pulse rounded mt-1"></div>
                                    ) : (
                                        <p className={`text-xl font-bold font-mono ${availableMargin !== null && availableMargin > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                                            ₹{availableMargin !== null ? fNum(availableMargin) : '---'}
                                        </p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-slate-400">Net Premium Required</p>
                                    <p className={`text-xl font-bold font-mono ${totalPremiumPaid > totalPremiumReceived ? 'text-rose-400' : 'text-emerald-400'}`}>
                                        {totalPremiumPaid > totalPremiumReceived
                                            ? `₹${fNum(totalPremiumPaid - totalPremiumReceived)} (Pay)`
                                            : `₹${fNum(totalPremiumReceived - totalPremiumPaid)} (Receive)`}
                                    </p>
                                </div>
                            </div>

                            {/* Order Leg Summary */}
                            <div className="space-y-2">
                                <p className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">Market Orders to Place ({legs.length})</p>
                                {legs.map((leg, i) => (
                                    <div key={leg.id} className="flex justify-between items-center bg-slate-800/50 p-3 rounded-xl border border-white/5">
                                        <div className="flex items-center gap-3">
                                            <span className={`px-2 py-1 text-[10px] font-bold rounded flex-shrink-0 ${leg.position === 'BUY' ? 'bg-sky-500/20 text-sky-400' : 'bg-rose-500/20 text-rose-400'
                                                }`}>
                                                {leg.position}
                                            </span>
                                            <div>
                                                <p className="text-sm font-bold text-slate-200">{leg.assetName.split(':')[1] || leg.assetName || 'Unselected Asset'}</p>
                                                <p className="text-xs text-slate-500">
                                                    Qty: {leg.numLots * leg.lotSize} ({leg.numLots} Lots)
                                                    {leg.targetProfit && <span className="ml-2 text-indigo-400 font-medium">• Target: ₹{leg.targetProfit}</span>}
                                                    {leg.stopLoss && <span className="ml-2 text-rose-400 font-medium">• SL: ₹{leg.stopLoss}</span>}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                        </div>

                        <div className="mt-8 flex justify-end gap-4">
                            {!isDeploying && deploymentStatus.type === 'none' && (
                                <>
                                    <button
                                        onClick={() => setIsDeployModalOpen(false)}
                                        className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmDeployment}
                                        className="px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold shadow-lg hover:shadow-sky-500/25 transition-all flex items-center gap-2"
                                    >
                                        Confirm & Fire Orders <Rocket className="w-4 h-4 ml-1" />
                                    </button>
                                </>
                            )}

                            {isDeploying && (
                                <button disabled className="px-6 py-3 rounded-xl bg-sky-500/50 text-white font-bold transition-all flex items-center gap-2 w-full justify-center opacity-75">
                                    <RefreshCw className="w-5 h-5 animate-spin" /> Placing Orders...
                                </button>
                            )}

                            {!isDeploying && deploymentStatus.type !== 'none' && (
                                <div className="flex gap-4 w-full">
                                    <button
                                        onClick={() => setIsDeployModalOpen(false)}
                                        className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
                                    >
                                        Close
                                    </button>
                                    {(deploymentStatus.type === 'success' || deploymentStatus.type === 'partial') && (
                                        <a
                                            href="/positions"
                                            className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold shadow-lg hover:shadow-emerald-500/25 transition-all text-center flex items-center justify-center gap-2"
                                        >
                                            View Active Positions <Activity className="w-4 h-4" />
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            )}

        </main>
    );
}
