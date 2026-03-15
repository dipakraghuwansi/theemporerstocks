"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { motion, Variants } from 'framer-motion';
import { Activity, ShieldAlert, Zap, TrendingDown, TrendingUp, Target, BrainCircuit, BarChart3, AlertCircle, HelpCircle, Scale, Copy, Check, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LineChart, Line, AreaChart, Area, ComposedChart } from 'recharts';
import { useQuantStore } from '@/lib/quantStore';

function MasterScoreCard({ scores, lastUpdated }: { scores: any, lastUpdated: Date | null }) {
    const totalScore = (scores.skew || 0) + (scores.pcr || 0) + (scores.zscore || 0) + (scores.maxPain || 0) + (scores.gex || 0) + (scores.vpcr || 0) + (scores.velocity || 0) + (scores.niftyBreadth || 0);
    // Boundary clamp -20.0 to +20.0
    const clampedScore = Math.max(-20.0, Math.min(20.0, totalScore));

    // For visual width (0% to 100%) - total span is 40 points
    const pct = ((clampedScore + 20.0) / 40) * 100;

    let sentiment = "Neutral Gridlock";
    let sentimentColor = "text-slate-400";
    let instruction = "Volatility edge is unclear. Wait for a directional catalyst.";
    let gradient = "from-slate-500 to-slate-400";

    if (clampedScore > 10) {
        sentiment = "Extreme Call Bias (Bullish Paradigm)";
        sentimentColor = "text-emerald-400";
        instruction = "Heavy systemic & institutional conviction. Unpinned Breakout via Long Calls or Bull Put Spreads.";
        gradient = "from-emerald-500 to-emerald-400";
    } else if (clampedScore > 3) {
        sentiment = "Mild Call Bias (Bullish Structure)";
        sentimentColor = "text-emerald-300";
        instruction = "Modest upside friction. Favour Bull Put Spreads over outright Long Calls.";
        gradient = "from-emerald-500/50 to-emerald-400/50";
    } else if (clampedScore < -10) {
        sentiment = "Extreme Put Bias (Bearish Paradigm)";
        sentimentColor = "text-rose-400";
        instruction = "Heavy structural fear & trend acceleration. Breakout via Long Puts or Bear Call Spreads.";
        gradient = "from-rose-500 to-rose-400";
    } else if (clampedScore < -3) {
        sentiment = "Mild Put Bias (Bearish Structure)";
        sentimentColor = "text-rose-300";
        instruction = "Modest downside friction. Favour Bear Call Spreads over outright Long Puts.";
        gradient = "from-rose-500/50 to-rose-400/50";
    }

    return (
        <div className="bg-linear-to-br border-2 border-indigo-500/30 bg-slate-900 rounded-3xl p-6 md:p-10 shadow-[0_0_60px_-15px_rgba(99,102,241,0.3)] relative overflow-hidden group mb-6">
            <div className="absolute top-0 right-0 p-8 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 relative z-10 gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-indigo-500/20 rounded-xl border border-indigo-500/30">
                            <Scale className="w-6 h-6 text-indigo-400" />
                        </div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Master Trend Score</h2>
                    </div>
                    <p className="text-sm text-slate-400 max-w-lg">
                        Synchronized algorithmic convection evaluating Volatility Skew, Max Pain Pinning, Put-Call Ratio Momentum, and Z-Score Mean Reversion.
                    </p>
                </div>

                <div className="text-right">
                    <div className="flex items-center justify-end gap-2 mb-1">
                        {lastUpdated && <span className="text-[10px] text-slate-500 flex items-center gap-1"><Activity className="w-3 h-3" /> {lastUpdated.toLocaleTimeString()}</span>}
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Directional Gravity</p>
                    </div>
                    <p className={`text-6xl font-black ${sentimentColor} drop-shadow-2xl`}>
                        {clampedScore > 0 ? '+' : ''}{clampedScore.toFixed(1)}
                    </p>
                </div>
            </div>

            <div className="relative z-10 bg-slate-950/50 rounded-2xl p-6 border border-white/5">
                <div className="flex justify-between items-end mb-4">
                    <p className="text-xs font-bold text-rose-400 uppercase tracking-widest text-left max-w-25 leading-tight">-20.0 Extreme Buy Puts</p>
                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest text-right max-w-25 leading-tight">+20.0 Extreme Buy Calls</p>
                </div>

                {/* 40-Point Gauge */}
                <div className="relative w-full h-6 bg-slate-800 rounded-full border border-slate-700/50 mb-6">
                    {/* Zero Line Marker */}
                    <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-500/30 z-0"></div>

                    {/* Active Fluid Fill */}
                    <div className={`absolute top-0 bottom-0 left-0 bg-linear-to-r ${gradient} rounded-full transition-all duration-1000 ease-out shadow-lg`} style={{ width: `${pct}%` }}></div>

                    {/* The Knob Indicator */}
                    <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] border-4 border-slate-900 transition-all duration-1000 ease-out z-20" style={{ left: `calc(${pct}% - 10px)` }}></div>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-2">
                        <Activity className={`w-4 h-4 ${sentimentColor}`} />
                        <span className={`text-sm font-bold uppercase tracking-wider ${sentimentColor}`}>{sentiment}</span>
                    </div>
                    <span className="text-xs text-slate-400">{instruction}</span>
                </div>
            </div>
        </div>
    );
}

function IVRankCard({ data, loading, error }: { data?: any, loading?: boolean, error?: string | null }) {

    if (loading) {
        return (
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-xl h-64 flex items-center justify-center">
                <div className="animate-pulse flex flex-col items-center">
                    <Activity className="w-8 h-8 text-slate-600 mb-3" />
                    <p className="text-sm font-medium text-slate-500">Evaluating 52-Week Volatility Series...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="bg-rose-950/20 border border-rose-500/20 rounded-3xl p-6 md:p-8 backdrop-blur-xl h-64 flex flex-col items-center justify-center text-center">
                <AlertCircle className="w-8 h-8 text-rose-500 mb-3" />
                <p className="text-sm font-medium text-rose-400">IV Engine Error</p>
                <p className="text-xs text-rose-500/70 mt-1 max-w-sm">{error}</p>
            </div>
        );
    }

    const rankVal = parseFloat(data.ivRank);
    const pctlVal = parseFloat(data.ivPercentile);

    const sparkData = data.historicalPoints ? data.historicalPoints.map((val: number, i: number) => ({
        day: i,
        vix: val
    })) : [];

    return (
        <div className="bg-linear-to-br from-slate-900/60 to-slate-950/80 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-xl hover:border-white/20 transition-colors shadow-2xl relative overflow-hidden group">

            <div className="flex items-start justify-between mb-6 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-sky-500/20 rounded-lg border border-sky-500/30">
                            <Activity className="w-4 h-4 text-sky-400" />
                        </div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Implied Volatility (IV) Rank</h2>
                    </div>
                    <p className="text-sm text-slate-400 max-w-sm">Evaluates the current India VIX ({data.currentIV}) relative to its 52-week extreme distribution.</p>
                </div>

                <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">IV Rank (IVR)</p>
                    <p className={`text-4xl font-black ${data.sentimentColor}`}>
                        {data.ivRank}
                    </p>
                    <p className={`text-[10px] font-bold tracking-wide mt-1 uppercase ${data.interpretationColor}`}>{data.interpretation}</p>
                </div>
            </div>

            {/* Content Body */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10 mt-6">

                {/* Visual Gauges */}
                <div className="space-y-5">
                    {/* Rank Gauge */}
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">IV Rank</p>
                            <p className="text-sm text-white font-bold">{data.ivRank}</p>
                        </div>
                        <div className="w-full bg-slate-800/50 rounded-full h-3 overflow-hidden border border-slate-700/50">
                            <div className="bg-linear-to-r from-emerald-500 via-orange-400 to-rose-500 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, rankVal)}%` }}></div>
                        </div>
                    </div>

                    {/* Percentile Gauge */}
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">IV Percentile (IVP)</p>
                            <p className="text-sm text-white font-bold">{data.ivPercentile}%</p>
                        </div>
                        <div className="w-full bg-slate-800/50 rounded-full h-3 overflow-hidden border border-slate-700/50">
                            <div className="bg-linear-to-r from-sky-500 to-sky-400 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, pctlVal)}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* Data Points */}
                <div className="flex flex-col justify-between">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <p className="text-[10px] text-slate-500 uppercase font-semibold">52-Week High</p>
                            <p className="text-lg font-bold text-rose-400">{data.highIV}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <p className="text-[10px] text-slate-500 uppercase font-semibold">52-Week Low</p>
                            <p className="text-lg font-bold text-emerald-400">{data.lowIV}</p>
                        </div>
                    </div>

                    <div className="mt-4 bg-sky-500/10 border border-sky-500/20 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1 cursor-help group/bias relative">
                            <p className="text-[10px] text-sky-400 uppercase font-bold">Algorithmic Bias</p>
                            <HelpCircle className="w-3 h-3 text-sky-400/70" />

                            {/* Tooltip Popup */}
                            {data.biasExplanation && (
                                <div className="absolute -left-2 bottom-full mb-3 w-64 p-3.5 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl opacity-0 group-hover/bias:opacity-100 transition-opacity pointer-events-none z-50 text-xs text-slate-300 font-medium leading-relaxed">
                                    {data.biasExplanation}
                                </div>
                            )}
                        </div>
                        <p className="text-sm text-slate-300 font-medium">{data.actionBias}</p>
                    </div>
                </div>
            </div>

            {/* Faded background mini-chart */}
            {sparkData.length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-40 opacity-10 pointer-events-none z-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sparkData}>
                            <defs>
                                <linearGradient id="colorVix" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="vix" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorVix)" />
                            <YAxis domain={['dataMin', 'dataMax']} hide={true} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}

function VolatilitySkewCard({ data, loading, error, spotPrice, selectedExpiry, setAvailableExpiries, onScore }: { data?: any, loading?: boolean, error?: string | null, spotPrice?: number, selectedExpiry?: string | null, setAvailableExpiries?: (exp: string[]) => void, onScore?: (val: number) => void }) {

    if (loading) {
        return (
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-xl h-96 flex items-center justify-center">
                <div className="animate-pulse flex flex-col items-center">
                    <Activity className="w-8 h-8 text-slate-600 mb-3" />
                    <p className="text-sm font-medium text-slate-500">Calculating Volatility Skew...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-rose-950/20 border border-rose-500/20 rounded-3xl p-6 md:p-8 backdrop-blur-xl h-96 flex flex-col items-center justify-center text-center">
                <AlertCircle className="w-8 h-8 text-rose-500 mb-3" />
                <p className="text-sm font-medium text-rose-400">Skew Engine Error</p>
                <p className="text-xs text-rose-500/70 mt-1 max-w-sm">{error}</p>
            </div>
        );
    }

    if (!data) return null;

    const callIvNum = parseFloat(data.call.iv);
    const putIvNum = parseFloat(data.put.iv);
    const skewSpreadNum = parseFloat(data.skewSpread);

    // Usually Call IV is bounded, Put IV goes higher
    const maxIv = Math.max(callIvNum, putIvNum, 1);
    const callWidth = (callIvNum / maxIv) * 100;
    const putWidth = (putIvNum / maxIv) * 100;

    let interpretation = "Neutral";
    let interpretationColor = "text-slate-400";
    if (skewSpreadNum > 5) {
        interpretation = "Extreme Fear (High Downside Demand)";
        interpretationColor = "text-rose-400";
    } else if (skewSpreadNum > 2) {
        interpretation = "Bearish Bias (Put Premium Expansive)";
        interpretationColor = "text-orange-400";
    } else if (skewSpreadNum < -2) {
        interpretation = "Extreme Euphoria (Call Premium Expansive)";
        interpretationColor = "text-emerald-400";
    }

    // Guard against NaN
    const safeSpot = data.spotPrice || 25600;

    return (
        <div className="bg-linear-to-br from-slate-900/60 to-slate-950/80 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-xl hover:border-white/20 transition-colors shadow-2xl relative overflow-hidden group">

            <div className="flex items-start justify-between mb-8 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-orange-500/20 rounded-lg border border-orange-500/30">
                            <Activity className="w-4 h-4 text-orange-400" />
                        </div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Volatility Skew / Fear Index</h2>
                    </div>
                    <p className="text-sm text-slate-400 max-w-md">Real-time comparison of Implied Volatility for 3% OTM Puts vs 3% OTM Calls.</p>
                </div>

                <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Skew Spread</p>
                    <p className="text-3xl font-black bg-clip-text text-transparent bg-linear-to-br from-white to-slate-400">
                        {skewSpreadNum > 0 ? "+" : ""}{data.skewSpread}%
                    </p>
                    <p className={`text-xs font-medium mt-1 ${interpretationColor}`}>{interpretation}</p>
                </div>
            </div>

            <div className="space-y-6 mt-8 relative z-10 w-full">

                {/* Put Row */}
                <div>
                    <div className="flex justify-between items-end mb-2">
                        <div>
                            <p className="text-xs text-slate-500 font-semibold uppercase">3% OTM Put Strike S-{(safeSpot * 0.03).toFixed(0)}</p>
                            <p className="text-sm text-rose-400 font-bold">{data.put.strike} PE</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xl font-bold text-white">{data.put.iv}% <span className="text-xs text-slate-500 font-normal">IV</span></p>
                        </div>
                    </div>
                    <div className="w-full bg-slate-800/50 rounded-full h-3 overflow-hidden border border-slate-700/50">
                        <div className="bg-linear-to-r from-rose-500 to-rose-400 h-full rounded-full transition-all duration-1000" style={{ width: `${putWidth}%` }}></div>
                    </div>
                </div>

                {/* Call Row */}
                <div>
                    <div className="flex justify-between items-end mb-2">
                        <div>
                            <p className="text-xs text-slate-500 font-semibold uppercase">3% OTM Call Strike S+{(safeSpot * 0.03).toFixed(0)}</p>
                            <p className="text-sm text-emerald-400 font-bold">{data.call.strike} CE</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xl font-bold text-white">{data.call.iv}% <span className="text-xs text-slate-500 font-normal">IV</span></p>
                        </div>
                    </div>
                    <div className="w-full bg-slate-800/50 rounded-full h-3 overflow-hidden border border-slate-700/50">
                        <div className="bg-linear-to-r from-emerald-500 to-emerald-400 h-full rounded-full transition-all duration-1000" style={{ width: `${callWidth}%` }}></div>
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-4 border-t border-white/5 text-xs text-slate-500 flex justify-between">
                <p>Higher Put Volatility represents active institutional hedging against downside risk.</p>
                <p>Calculated T: {data.daysToExpiry}D</p>
            </div>
        </div>
    );
}

function PCRCard({ data, loading, error }: { data?: any, loading?: boolean, error?: string | null }) {

    if (loading) {
        return (
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-xl h-64 flex items-center justify-center">
                <div className="animate-pulse flex flex-col items-center">
                    <Activity className="w-8 h-8 text-slate-600 mb-3" />
                    <p className="text-sm font-medium text-slate-500">Aggregating Open Interest...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="bg-rose-950/20 border border-rose-500/20 rounded-3xl p-6 md:p-8 backdrop-blur-xl h-64 flex flex-col items-center justify-center text-center">
                <AlertCircle className="w-8 h-8 text-rose-500 mb-3" />
                <p className="text-sm font-medium text-rose-400">PCR Engine Error</p>
                <p className="text-xs text-rose-500/70 mt-1 max-w-sm">{error}</p>
            </div>
        );
    }

    const pcrNum = parseFloat(data.pcr);
    let sentiment = "Neutral";
    let sentimentColor = "text-slate-400";
    let bgPulse = "";

    // General PCR theory: Higher PCR = More Puts = Bearish. Extreme High PCR = Oversold (Reversal Bullish).
    if (pcrNum > 1.4) {
        sentiment = "Extremely Oversold (Bullish Reversal)";
        sentimentColor = "text-emerald-400";
        bgPulse = "bg-emerald-500/10";
    } else if (pcrNum > 1.0) {
        sentiment = "Bearish Sentiment";
        sentimentColor = "text-rose-400";
        bgPulse = "bg-rose-500/10";
    } else if (pcrNum < 0.6) {
        sentiment = "Extremely Overbought (Bearish Reversal)";
        sentimentColor = "text-rose-400";
        bgPulse = "bg-rose-500/10";
    } else {
        sentiment = "Bullish Sentiment";
        sentimentColor = "text-emerald-400";
        bgPulse = "bg-emerald-500/10";
    }

    const totalOI = data.totalPutOI + data.totalCallOI;
    const putPct = (data.totalPutOI / totalOI) * 100;
    const callPct = (data.totalCallOI / totalOI) * 100;

    return (
        <div className={`border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-xl transition-colors shadow-2xl relative overflow-hidden group ${bgPulse || 'bg-linear-to-br from-slate-900/60 to-slate-950/80'}`}>
            <div className="flex items-start justify-between mb-6 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-cyan-500/20 rounded-lg border border-cyan-500/30">
                            <TrendingDown className="w-4 h-4 text-cyan-400" />
                        </div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Put-Call Ratio (PCR)</h2>
                    </div>
                    <p className="text-sm text-slate-400 max-w-sm">Aggregate Open Interest ratio indicating broad market institutional sentiment.</p>
                </div>

                <div className="text-right">
                    <p className="text-4xl font-black bg-clip-text text-transparent bg-linear-to-br from-white to-slate-400">
                        {data.pcr}
                    </p>
                    <p className={`text-[10px] font-bold tracking-wide mt-1 uppercase ${sentimentColor}`}>{sentiment}</p>
                    <p className="text-[10px] text-cyan-400/70 font-medium mt-1 uppercase tracking-tight">Expiry: {data.nearestExpiry}</p>
                </div>
            </div>

            <div className="mt-6 relative z-10">
                <div className="flex justify-between text-xs font-semibold mb-2">
                    <span className="text-rose-400">PUT OI ({putPct.toFixed(1)}%)</span>
                    <span className="text-emerald-400">CALL OI ({callPct.toFixed(1)}%)</span>
                </div>

                {/* Visual Ratio Bar */}
                <div className="w-full bg-slate-800 rounded-full h-4 flex overflow-hidden border border-slate-700">
                    <div className="bg-rose-500 h-full" style={{ width: `${putPct}%` }}></div>
                    <div className="bg-emerald-500 h-full" style={{ width: `${callPct}%` }}></div>
                </div>

                <div className="flex justify-between text-[10px] text-slate-500 mt-2 uppercase">
                    <span>{data.totalPutOI.toLocaleString()} Contracts</span>
                    <span>{data.totalCallOI.toLocaleString()} Contracts</span>
                </div>
            </div>
        </div>
    );
}

function ZScoreCard({ data, loading, error }: { data?: any, loading?: boolean, error?: string | null }) {

    if (loading) {
        return (
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-xl h-64 flex items-center justify-center">
                <div className="animate-pulse flex flex-col items-center">
                    <Activity className="w-8 h-8 text-slate-600 mb-3" />
                    <p className="text-sm font-medium text-slate-500">Calculating Standard Deviations...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="bg-rose-950/20 border border-rose-500/20 rounded-3xl p-6 md:p-8 backdrop-blur-xl h-64 flex flex-col items-center justify-center text-center">
                <AlertCircle className="w-8 h-8 text-rose-500 mb-3" />
                <p className="text-sm font-medium text-rose-400">Z-Score Engine Error</p>
                <p className="text-xs text-rose-500/70 mt-1 max-w-sm">{error}</p>
            </div>
        );
    }

    // Format chart data for mini trendline
    const chartData = data.historicalPoints ? data.historicalPoints.map((val: number, i: number) => ({
        day: i,
        price: val
    })) : [];

    const zNum = parseFloat(data.zScore);
    const minZ = -3;
    const maxZ = 3;
    const zPct = Math.max(0, Math.min(100, ((zNum - minZ) / (maxZ - minZ)) * 100)); // Normalize specifically for the gauge visual

    return (
        <div className="bg-linear-to-br from-slate-900/60 to-slate-950/80 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-xl hover:border-white/20 transition-colors shadow-2xl relative overflow-hidden group">

            <div className="flex items-start justify-between mb-6 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-purple-500/20 rounded-lg border border-purple-500/30">
                            <Activity className="w-4 h-4 text-purple-400" />
                        </div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Statistical Z-Score Engine</h2>
                    </div>
                    <p className="text-sm text-slate-400 max-w-sm">Evaluates standard deviations away from the 20-Day Simple Moving Average (Mean Reversion).</p>
                </div>

                <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Z-Score</p>
                    <p className="text-4xl font-black bg-clip-text text-transparent bg-linear-to-br from-white to-slate-400">
                        {zNum > 0 ? "+" : ""}{data.zScore}
                    </p>
                    <p className={`text-xs font-bold tracking-wide mt-1 uppercase ${data.sentimentColor}`}>{data.interpretation}</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6 relative z-10">
                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">20-Day SMA</p>
                    <p className="text-lg font-bold text-white">{data.sma20}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Current Spot</p>
                    <p className="text-lg font-bold text-white">{data.currentSpot}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Standard Deviation Limit</p>
                    <p className="text-lg font-bold text-slate-300">σ = {data.stdDev20}</p>
                </div>
            </div>

            <div className="relative z-10 mt-2">
                {/* Visual Z-Score Line/Gauge representation */}
                <div className="h-0.5 w-full bg-slate-700/50 mt-8 mb-2 relative">
                    {/* Tick Marks for Standard Deviations */}
                    {[-3, -2, -1, 0, 1, 2, 3].map(tick => (
                        <div key={tick} className="absolute h-3 w-px bg-slate-600 top-1/2 -translate-y-1/2" style={{ left: `${((tick + 3) / 6) * 100}%` }}>
                            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-slate-500">{tick === 0 ? 'Mean' : `${tick}σ`}</span>
                        </div>
                    ))}

                    {/* The actual Z position indicator */}
                    <div
                        className={`absolute w-3 h-3 rounded-full top-1/2 -translate-y-1/2 -translate-x-1/2 shadow-[0_0_15px_rgba(255,255,255,0.5)] z-20 ${zNum >= 2 ? 'bg-rose-500' : zNum <= -2 ? 'bg-emerald-500' : 'bg-purple-500'
                            }`}
                        style={{ left: `${zPct}%` }}
                    ></div>
                </div>
            </div>

            {/* Faded background mini-chart */}
            {chartData.length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-32 opacity-20 pointer-events-none z-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <ReferenceLine y={parseFloat(data.sma20)} stroke="#94a3b8" strokeDasharray="3 3" />
                            <Line type="monotone" dataKey="price" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
                            <YAxis domain={['dataMin', 'dataMax']} hide={true} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}

function MaxPainCard({ data, loading, error }: { data?: any, loading?: boolean, error?: string | null }) {

    if (loading) {
        return (
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-xl h-96 flex items-center justify-center">
                <div className="animate-pulse flex flex-col items-center">
                    <BarChart3 className="w-8 h-8 text-slate-600 mb-3" />
                    <p className="text-sm font-medium text-slate-500">Calculating Theoretical Max Pain...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-rose-950/20 border border-rose-500/20 rounded-3xl p-6 md:p-8 backdrop-blur-xl h-96 flex flex-col items-center justify-center text-center">
                <AlertCircle className="w-8 h-8 text-rose-500 mb-3" />
                <p className="text-sm font-medium text-rose-400">Max Pain Engine Error</p>
                <p className="text-xs text-rose-500/70 mt-1 max-w-sm">{error}</p>
            </div>
        );
    }

    if (!data) return null;

    // Format data for chart
    const chartData = (data.painDistribution || []).map((d: any) => ({
        strike: d.strike.toString(),
        pain: d.totalPain / 10000000 // Scale it down drastically for readability (in Crores roughly)
    }));

    return (
        <div className="bg-linear-to-br from-indigo-950/40 to-slate-900/40 border border-indigo-500/20 rounded-3xl p-6 md:p-8 backdrop-blur-xl hover:border-indigo-500/40 transition-colors shadow-2xl relative overflow-hidden group">

            {/* Background glow behind target strike */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-700 pointer-events-none"></div>

            <div className="flex items-start justify-between mb-8 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-indigo-500/20 rounded-lg border border-indigo-500/30">
                            <Target className="w-4 h-4 text-indigo-400" />
                        </div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Open Interest "Max Pain"</h2>
                    </div>
                    <p className="text-sm text-slate-400 max-w-md">The specific strike price where option buyers experience maximum theoretical loss at expiration.</p>
                </div>

                <div className="text-right">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Predicted Pin Strike</p>
                    <p className="text-3xl font-black bg-clip-text text-transparent bg-linear-to-br from-white to-slate-400">
                        {data.maxPainStrike}
                    </p>
                    <p className="text-xs text-indigo-400 font-medium mt-1">{data.nearestExpiry}</p>
                </div>
            </div>

            <div className="h-48 w-full mt-4 relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <XAxis
                            dataKey="strike"
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            hide={true}
                        />
                        <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                    return (
                                        <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl shadow-xl">
                                            <p className="text-white font-bold mb-1">Strike: {label}</p>
                                            <p className="text-slate-300 text-xs">Relative Intrinsic Value</p>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Bar dataKey="pain" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry: any, index: number) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={Number(entry.strike) === data.maxPainStrike ? '#6366f1' : '#334155'}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            {/* Legend / Instruction */}
            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
                <p>The lowest bar determines the path of least resistance for Option Writers.</p>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                    <span>Max Pain</span>
                </div>
            </div>
        </div>
    );
}

interface GEXHistoryPoint {
    time: string;
    netGex: number;
    gexMomentum: number;
}


function GEXCard({ data, history = [], loading, error, spotPrice, onScore }: { data?: any, history?: GEXHistoryPoint[], loading?: boolean, error?: string | null, spotPrice?: number, onScore?: (val: number) => void }) {
    useEffect(() => {
        if (data && onScore) {
            const net = parseFloat(data.netGexScore || 0);
            let score = 0;
            score = Math.max(-2.5, Math.min(2.5, (net / 1000000) * 2.5));
            onScore(score);
        }
    }, [data, onScore]); // Simplified: only emit score. History is managed globally.

    if (loading) return <div className="animate-pulse bg-slate-900 rounded-2xl h-50"></div>;
    if (error) return <div className="text-red-400 p-4 bg-slate-900 rounded-2xl">Error: {error}</div>;
    if (!data) return null;

    const gexColor = (data.netGexScore || 0) > 0 ? "text-emerald-400" : "text-rose-400";

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 hover:border-slate-700 transition-colors shadow-xl">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-500/20 rounded-xl">
                    <BrainCircuit className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Dealer Gamma Exposure (GEX)</h2>
                    <p className="text-sm text-slate-500">Live options hedging gravity profile</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row items-stretch justify-between gap-8 h-full">
                <div className="w-full md:w-1/3 flex flex-col justify-center">
                    <div className="mb-2">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Net GEX Profile</p>
                        <p className={`text-3xl font-black tracking-tight ${gexColor}`}>
                            {data.netGexScore > 0 ? '+' : ''}{Math.round(data.netGexScore).toLocaleString()}
                        </p>
                    </div>
                    <div className="mt-4 bg-sky-500/10 border border-sky-500/20 rounded-xl p-3">
                        <p className="text-[10px] text-sky-400 uppercase font-bold mb-1">Institutional Bias</p>
                        <p className="text-sm text-slate-300 font-medium">{data.interpretation}</p>
                    </div>

                    <div className="mt-4 bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                        <p className="text-[10px] text-purple-400 uppercase font-bold mb-1">Zero Gamma Level (ZGL)</p>
                        <div className="flex items-center justify-between">
                            <span className="text-2xl font-black text-white">{data.zeroGammaLevel || 'N/A'}</span>
                            {data.zeroGammaLevel && (
                                <span className={`text-xs font-bold ${(spotPrice || 0) > data.zeroGammaLevel ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {(spotPrice || 0) > data.zeroGammaLevel ? 'Positive Gamma' : 'Trapdoor (Vol Expand)'}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Institutional Brick Walls */}
                    <div className="mt-4 flex flex-col gap-3">
                        {data.topPositiveStrikes && data.topPositiveStrikes.length > 0 && (
                            <div className="bg-slate-800/50 p-3 rounded-xl border border-emerald-500/20">
                                <p className="text-[9px] text-emerald-400 uppercase font-bold tracking-widest mb-2 flex items-center justify-between">
                                    <span>Overhead Resistance (Calls)</span>
                                    <span>GEX</span>
                                </p>
                                <div className="flex flex-col gap-1.5">
                                    {(data.topPositiveStrikes || []).map((s: any) => (
                                        <div key={`pos-${s.strike}`} className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-slate-200">{s.strike}</span>
                                            <span className="text-emerald-400">+{Math.round(s.gex / 1000).toLocaleString()}k</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {data.topNegativeStrikes && data.topNegativeStrikes.length > 0 && (
                            <div className="bg-slate-800/50 p-3 rounded-xl border border-rose-500/20">
                                <p className="text-[9px] text-rose-400 uppercase font-bold tracking-widest mb-2 flex items-center justify-between">
                                    <span>Foundation Support (Puts)</span>
                                    <span>GEX</span>
                                </p>
                                <div className="flex flex-col gap-1.5">
                                    {(data.topNegativeStrikes || []).map((s: any) => (
                                        <div key={`neg-${s.strike}`} className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-slate-200">{s.strike}</span>
                                            <span className="text-rose-400">{Math.round(s.gex / 1000).toLocaleString()}k</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-full md:w-2/3 max-w-xl h-55 flex flex-col gap-2">
                    {history.length > 0 ? (
                        <>
                            <div className="h-35 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={history} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorNetGex" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.6} />
                                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis
                                            dataKey="time"
                                            stroke="#475569"
                                            fontSize={10}
                                            tickMargin={8}
                                            minTickGap={30}
                                        />
                                        <YAxis
                                            stroke="#475569"
                                            fontSize={10}
                                            tickFormatter={(val) => (val / 1000000).toFixed(1) + 'M'}
                                            domain={['auto', 'auto']}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', padding: '10px' }}
                                            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                            labelStyle={{ color: '#94a3b8', fontSize: '10px', marginBottom: '4px' }}
                                            formatter={(value: any) => [(value || 0).toLocaleString(), 'Net GEX Profile']}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="netGex"
                                            stroke="#8b5cf6"
                                            fillOpacity={1}
                                            fill="url(#colorNetGex)"
                                            strokeWidth={2}
                                            activeDot={{ r: 6, fill: '#8b5cf6', stroke: '#0f172a', strokeWidth: 2 }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="h-17.5 w-full border-t border-slate-800/50 pt-1">
                                <div className="flex justify-between items-center mb-1 px-4">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Momentum (ROC)</span>
                                    {history.length > 0 && (
                                        <span className={`text-[10px] font-black ${history[history.length - 1].gexMomentum >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {history[history.length - 1].gexMomentum > 0 ? '+' : ''}
                                            {Math.round(history[history.length - 1].gexMomentum).toLocaleString()}
                                        </span>
                                    )}
                                </div>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={history} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorGexMom" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <YAxis domain={['auto', 'auto']} hide />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', padding: '6px' }}
                                            itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                                            labelStyle={{ display: 'none' }}
                                            formatter={(value: any) => [`${value > 0 ? '+' : ''}${(value / 1000).toFixed(1)}k`, 'GEX Velocity']}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="gexMomentum"
                                            stroke="#38bdf8"
                                            fillOpacity={1}
                                            fill="url(#colorGexMom)"
                                            strokeWidth={1.5}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    ) : (
                        <div className="h-full w-full flex items-center justify-center text-slate-600 text-sm italic">
                            Awaiting intraday history...
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800/50">
                <p className="text-xs text-slate-400 leading-relaxed">
                    If Net GEX is extremely positive, market makers will buy dips and sell rips, pinning the market and suppressing volatility. If Net GEX turns negative, market makers are forced to sell into selling, causing violent breakout acceleration.
                </p>
            </div>
        </div>
    );
}

interface VPCRHistoryPoint {
    time: string;
    callVol: number;
    putVol: number;
    vpcr: number;
    callMomentum: number;
    putMomentum: number;
}

function VPCRCard({ data, history = [], loading, error }: { data?: any, history?: VPCRHistoryPoint[], loading?: boolean, error?: string | null }) {
    if (loading) return <div className="animate-pulse bg-slate-900 rounded-2xl h-50"></div>;
    if (error) return <div className="text-red-400 p-4 bg-slate-900 rounded-2xl">Error: {error}</div>;
    if (!data) return null;

    const vpcr = parseFloat(data.vpcr);
    const vpcrColor = vpcr > 1.2 ? "text-emerald-400" : vpcr < 0.8 ? "text-rose-400" : "text-amber-400";

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 hover:border-slate-700 transition-colors shadow-xl">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-pink-500/20 rounded-xl">
                    <Activity className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Intraday Volume PCR (V-PCR)</h2>
                    <p className="text-sm text-slate-500">Live "Smart Money" options flow momentum</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row items-stretch justify-between gap-8 h-full">
                <div className="w-full md:w-1/3 flex flex-col justify-center">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Live Ratio (Puts/Calls)</p>
                    <p className={`text-4xl font-black tracking-tight ${vpcrColor}`}>{data.vpcr}</p>
                    <div className="flex justify-between mt-4 text-[10px] text-slate-500 uppercase font-bold tracking-widest border-t border-slate-800 pt-2">
                        <span className="text-emerald-400">Call Vol: {(data.totalCallVolume / 100000).toFixed(1)}L</span>
                        <span className="text-rose-400">Put Vol: {(data.totalPutVolume / 100000).toFixed(1)}L</span>
                    </div>
                </div>

                <div className="w-full md:w-2/3 max-w-xl h-55 flex flex-col gap-2">
                    {history.length > 0 ? (
                        <>
                            <div className="h-35 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={history} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorCallVol" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorPutVol" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.6} />
                                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis
                                            dataKey="time"
                                            stroke="#475569"
                                            fontSize={10}
                                            tickMargin={8}
                                            minTickGap={30}
                                        />
                                        <YAxis
                                            stroke="#475569"
                                            fontSize={10}
                                            tickFormatter={(val) => (val / 100000).toFixed(1) + 'L'}
                                            domain={['auto', 'auto']}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', padding: '10px' }}
                                            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                            labelStyle={{ color: '#94a3b8', fontSize: '10px', marginBottom: '4px' }}
                                            formatter={(value: any, name: any) => [(value || 0).toLocaleString(), name === 'callVol' ? 'Call Volume (Resistance)' : 'Put Volume (Support)']}
                                        />
                                        {/* Color Swap: Calls = Green (Resistance), Puts = Red (Support) */}
                                        <Area
                                            type="monotone"
                                            dataKey="callVol"
                                            stroke="#10b981"
                                            fillOpacity={1}
                                            fill="url(#colorCallVol)"
                                            strokeWidth={2}
                                            activeDot={{ r: 6, fill: '#10b981', stroke: '#0f172a', strokeWidth: 2 }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="putVol"
                                            stroke="#f43f5e"
                                            fillOpacity={1}
                                            fill="url(#colorPutVol)"
                                            strokeWidth={2}
                                            activeDot={{ r: 6, fill: '#f43f5e', stroke: '#0f172a', strokeWidth: 2 }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="h-17.5 w-full border-t border-slate-800/50 pt-1">
                                <div className="flex justify-between items-center mb-1 px-4">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Momentum (ROC)</span>
                                    {history.length > 0 && (
                                        <div className="flex justify-between gap-4">
                                            <span className="text-[10px] font-black text-emerald-400">
                                                +{(history[history.length - 1].callMomentum / 1000).toFixed(1)}k
                                            </span>
                                            <span className="text-[10px] font-black text-rose-400">
                                                +{(history[history.length - 1].putMomentum / 1000).toFixed(1)}k
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={history} stackOffset="expand" margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorCallMom" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorPutMom" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <YAxis domain={['auto', 'auto']} hide />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', padding: '6px' }}
                                            itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                                            labelStyle={{ display: 'none' }}
                                            formatter={(value: any, name: any) => [`+${(value / 1000).toFixed(1)}k`, name === 'callMomentum' ? 'Call Velocity' : 'Put Velocity']}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="callMomentum"
                                            stackId="1"
                                            stroke="#10b981"
                                            fillOpacity={1}
                                            fill="url(#colorCallMom)"
                                            strokeWidth={1.5}
                                            isAnimationActive={false}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="putMomentum"
                                            stackId="1"
                                            stroke="#f43f5e"
                                            fillOpacity={1}
                                            fill="url(#colorPutMom)"
                                            strokeWidth={1.5}
                                            isAnimationActive={false}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center border border-dashed border-slate-700/50 rounded-2xl p-4">
                            <Activity className="w-6 h-6 text-slate-600 mb-2 animate-pulse" />
                            <p className="text-xs text-slate-500 text-center font-medium">Accumulating tick data for intraday flow visualization...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function CompactExtremesList({ title, items, type }: { title: string, items: any[], type: 'up' | 'down' }) {
    return (
        <div className="flex-1 min-w-0">
            <h3 className={`text-[9px] font-black uppercase tracking-[0.15em] mb-2 ${type === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {title}
            </h3>
            <div className="space-y-0.5 max-h-35 overflow-y-auto pr-1 flex flex-col">
                {items.map((item: any) => (
                    <div key={item.symbol} className="flex items-center justify-between py-1 border-b border-slate-800/30 last:border-0 group">
                        <span className="text-[10px] font-bold text-slate-300 group-hover:text-white transition-colors truncate mr-2">
                            {item.symbol}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[9px] text-slate-500 font-medium font-mono">₹{Math.round(item.price).toLocaleString()}</span>
                            <span className={`text-[10px] font-black tabular-nums ${type === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {type === 'up' ? '+' : ''}{item.deviation.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function NiftyBreadthCard({ data, loading, error }: { data?: any, loading?: boolean, error?: string | null }) {

    if (loading) return <div className="animate-pulse bg-slate-900 rounded-2xl h-50"></div>;
    if (error) return <div className="text-red-400 p-4 bg-slate-900 rounded-2xl">Error: {error}</div>;
    if (!data) return null;

    const { bullishCount, bearishCount, totalProcessed, percentage, interpretation, sentimentColor } = data;

    // Safety check just in case API returns zero processed
    const validTotal = totalProcessed > 0 ? totalProcessed : 50;
    const bullPctNum = parseFloat(percentage);

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 hover:border-slate-700 transition-colors shadow-xl">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-500/20 rounded-xl">
                    <Activity className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Heavyweight VWAP Breadth</h2>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-sm">Evaluates the Top 50 Index Constituents vs their daily VWAP. A highly negative breadth warns that the index is being manipulated by a few stocks while the broader market bleeds.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Heavyweight Flow Matrix</p>
                    <p className={`text-xl font-black tracking-tight ${sentimentColor} mb-4`}>
                        {interpretation}
                    </p>

                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-emerald-400">{bullishCount} Bullish</span>
                        <span className="text-sm font-bold text-slate-400 text-center">of {validTotal}</span>
                        <span className="text-sm font-bold text-rose-400">{bearishCount} Bearish</span>
                    </div>

                    <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                        <div
                            className="bg-emerald-500 transition-all duration-1000 ease-out h-full"
                            style={{ width: `${bullPctNum}%` }}
                        />
                        <div
                            className="bg-rose-500 transition-all duration-1000 ease-out h-full"
                            style={{ width: `${100 - bullPctNum}%` }}
                        />
                    </div>
                </div>

                <div className="flex items-center justify-center md:justify-end border-t md:border-t-0 md:border-l border-slate-800 pt-6 md:pt-0 md:pl-8">
                    <div className="relative w-36 h-36 flex items-center justify-center group cursor-help">
                        {/* Background Track */}
                        <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 100 100">
                            <circle
                                cx="50"
                                cy="50"
                                r="40"
                                fill="none"
                                stroke="rgba(30, 41, 59, 0.5)"
                                strokeWidth="8"
                            />
                            {/* Animated Fill */}
                            <circle
                                cx="50"
                                cy="50"
                                r="40"
                                fill="none"
                                stroke={bullPctNum > 50 ? "#10b981" : "#f43f5e"}
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray="251.2"
                                strokeDashoffset={251.2 - (251.2 * bullPctNum) / 100}
                                className="transition-all duration-1000 ease-out"
                            />
                        </svg>

                        <div className="absolute flex flex-col items-center justify-center text-center">
                            <div className="flex items-baseline justify-center gap-0.5">
                                <span className={`text-4xl font-black tracking-tighter ${sentimentColor}`}>
                                    {Math.round(bullPctNum)}
                                </span>
                                <span className={`text-lg font-bold ${sentimentColor}`}>%</span>
                            </div>
                            <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mt-1">&gt; Daily VWAP</p>
                        </div>

                        {/* Hover Context Tooltip */}
                        <div className="absolute top-[105%] right-0 w-70 bg-slate-800 border border-slate-600/50 p-4 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 text-left pointer-events-none">
                            <p className="text-white font-bold mb-1.5 text-[11px] flex items-center gap-1.5 uppercase tracking-widest"><Activity className="w-3.5 h-3.5 text-indigo-400" /> AI Context Insight</p>
                            <p className="text-slate-300 text-[11px] leading-relaxed">
                                {data.llmContext || "Evaluate the True Underlying Equity flows by comparing all 50 constituents against their Volume-Weighted Average Price."}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800/50">
                <div className="grid grid-cols-2 gap-8">
                    <CompactExtremesList title="Top Above VWAP" items={data.extremes?.topGainers || []} type="up" />
                    <CompactExtremesList title="Top Below VWAP" items={data.extremes?.topLosers || []} type="down" />
                </div>
            </div>
        </div>
    );
}

function MidcapBreadthCard({ data, loading, error }: { data?: any, loading?: boolean, error?: string | null }) {
    if (loading) return <div className="animate-pulse bg-slate-900 rounded-3xl h-60"></div>;
    if (error) return <div className="text-red-400 p-4 bg-slate-900 rounded-3xl h-60 flex items-center justify-center border border-slate-800">Error: {error}</div>;
    if (!data) return null;

    const bullishCount = data.bullishCount || 0;
    const bearishCount = data.bearishCount || 0;
    const total = data.totalProcessed || 150;
    const pct = parseFloat(data.percentage || "0");
    const interpretation = data.interpretation || "Neutral";
    const sentimentColor = data.sentimentColor || "text-slate-400";

    // Ensure we don't divide by zero and handle percentage correctly
    const bullPctNum = isNaN(pct) ? 0 : pct;

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 hover:border-slate-700 transition-colors shadow-xl">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-500/20 rounded-xl">
                    <BarChart3 className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">MidCap Market Breadth</h2>
                    <p className="text-sm text-slate-500">Nifty Midcap 150 Advance/Decline vs VWAP</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Risk Participation Matrix</p>
                    <p className={`text-xl font-black tracking-tight ${sentimentColor} mb-3`}>
                        {interpretation}
                    </p>

                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-emerald-400">{bullishCount} Bullish</span>
                        <span className="text-sm font-bold text-slate-400 text-center">of {total}</span>
                        <span className="text-sm font-bold text-rose-400">{bearishCount} Bearish</span>
                    </div>

                    <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                        <div
                            className="bg-emerald-500 transition-all duration-1000 ease-out h-full"
                            style={{ width: `${bullPctNum}%` }}
                        />
                        <div
                            className="bg-rose-500 transition-all duration-1000 ease-out h-full"
                            style={{ width: `${100 - bullPctNum}%` }}
                        />
                    </div>
                </div>

                <div className="flex items-center justify-center md:justify-end border-t md:border-t-0 md:border-l border-slate-800 pt-6 md:pt-0 md:pl-8">
                    <div className="relative w-36 h-36 flex items-center justify-center group cursor-help">
                        <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 100 100">
                            <circle
                                cx="50"
                                cy="50"
                                r="40"
                                fill="none"
                                stroke="rgba(30, 41, 59, 0.5)"
                                strokeWidth="8"
                            />
                            <circle
                                cx="50"
                                cy="50"
                                r="40"
                                fill="none"
                                stroke={bullPctNum > 50 ? "#10b981" : "#f43f5e"}
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray="251.2"
                                strokeDashoffset={251.2 - (251.2 * bullPctNum) / 100}
                                className="transition-all duration-1000 ease-out"
                            />
                        </svg>

                        <div className="absolute flex flex-col items-center justify-center text-center">
                            <div className="flex items-baseline justify-center gap-0.5">
                                <span className={`text-4xl font-black tracking-tighter ${sentimentColor}`}>
                                    {Math.round(bullPctNum)}
                                </span>
                                <span className={`text-lg font-bold ${sentimentColor}`}>%</span>
                            </div>
                            <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mt-1">&gt; Daily VWAP</p>
                        </div>

                        {/* Hover Context Tooltip */}
                        <div className="absolute top-[105%] right-0 w-70 bg-slate-800 border border-slate-600/50 p-4 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 text-left pointer-events-none">
                            <p className="text-white font-bold mb-1.5 text-[11px] flex items-center gap-1.5 uppercase tracking-widest"><Activity className="w-3.5 h-3.5 text-indigo-400" /> AI Context Insight</p>
                            <p className="text-slate-300 text-[11px] leading-relaxed">
                                {data.llmContext || "Evaluate risk sentiment by comparing all 150 Midcap constituents against their Volume-Weighted Average Price."}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800/50">
                <div className="grid grid-cols-2 gap-8">
                    <CompactExtremesList title="Top Above VWAP" items={data.extremes?.topGainers || []} type="up" />
                    <CompactExtremesList title="Top Below VWAP" items={data.extremes?.topLosers || []} type="down" />
                </div>
            </div>
        </div>
    );
}


function VelocityCard({ data, loading, error }: { data?: any, loading?: boolean, error?: string | null }) {

    if (loading) return <div className="animate-pulse bg-slate-900 rounded-2xl h-50"></div>;
    if (error) return <div className="text-red-400 p-4 bg-slate-900 rounded-2xl">Error: {error}</div>;
    if (!data) return null;

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 hover:border-slate-700 transition-colors shadow-xl">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-yellow-500/20 rounded-xl">
                    <TrendingDown className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Price-Action Velocity</h2>
                    <p className="text-sm text-slate-500">Structural trend confirmation (9 & 21 EMA)</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Active Trend Alignment</p>
                    <p className={`text-xl font-black tracking-tight ${data.trendColor} mb-3`}>
                        {data.velocityStatus}
                    </p>
                    <div className="flex gap-4">
                        <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                            <span className="text-[10px] text-slate-400 uppercase block mb-1">Fast (9)</span>
                            <span className="text-sm text-slate-200 font-bold">{data.currentEma9}</span>
                        </div>
                        <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                            <span className="text-[10px] text-slate-400 uppercase block mb-1">Slow (21)</span>
                            <span className="text-sm text-slate-200 font-bold">{data.currentEma21}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TerminalVWAPCard() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchVWAP = async () => {
            try {
                const res = await fetch(`/api/quant/vwap?asset=NIFTY`);
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "Failed to fetch");
                setData(json);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchVWAP();
        const interval = setInterval(() => {
            const h = parseInt(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date()));
            // Only poll during the active MOC window (15:00 - 15:59 IST)
            if (h === 15) fetchVWAP();
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="animate-pulse bg-slate-900 rounded-2xl h-50"></div>;
    if (error) return <div className="text-red-400 p-4 bg-slate-900 rounded-2xl">Error: {error}</div>;
    if (!data) return null;

    if (data.status === 'dormant') {
        return (
            <div className="bg-slate-900/50 border border-slate-800 border-dashed rounded-3xl p-6 md:p-8 flex items-center justify-center opacity-70 shadow-inner">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="relative mb-2">
                        <div className="absolute inset-0 rounded-full bg-indigo-500 blur-md animate-pulse opacity-20"></div>
                        <Target className="w-8 h-8 text-indigo-500/50 relative z-10" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-400">Terminal VWAP (MOC Predictor)</h2>
                    <p className="text-xs text-slate-500 max-w-md">Currently dormant. Waiting for the final 30-minute institutional MOC window to open at <span className="text-slate-300 font-bold">15:00 IST</span> to calculate the expected settlement price.</p>
                </div>
            </div>
        );
    }

    const { history, latestLtp, latestVwap, divergence } = data;
    const divColor = divergence > 0 ? "text-emerald-400" : divergence < 0 ? "text-rose-400" : "text-slate-400";
    const divPrefix = divergence > 0 ? "+" : "";

    return (
        <div className="relative bg-black border border-indigo-500/30 rounded-3xl p-6 md:p-8 shadow-[0_0_40px_-10px_rgba(99,102,241,0.15)] overflow-hidden">
            {/* Active Radar Background Glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-[80px] pointer-events-none"></div>

            <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="p-2 bg-indigo-950 rounded-xl border border-indigo-500/30">
                    <Target className="w-5 h-5 text-indigo-400 animate-pulse" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-3">
                        Terminal VWAP
                        <span className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 border border-red-500/50 text-[9px] uppercase font-black tracking-widest animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.4)]">Live MOC Tracker</span>
                    </h2>
                    <p className="text-sm text-indigo-300/80">Expected Settlement Price Convergence</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row items-stretch justify-between gap-8 h-full relative z-10">
                <div className="w-full md:w-1/3 flex flex-col justify-center gap-6">
                    <div>
                        <p className="text-[10px] font-bold text-indigo-400/80 uppercase tracking-widest mb-1">Anchored VWAP (Expected Close)</p>
                        <p className="text-4xl font-black tracking-tight text-white">{latestVwap}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Current Screen Price</p>
                        <p className="text-2xl font-bold tracking-tight text-slate-300">{latestLtp}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Divergence (Settlement Drag)</p>
                        <p className={`text-xl font-bold tracking-tight ${divColor}`}>{divPrefix}{divergence}</p>
                    </div>
                </div>

                <div className="w-full md:w-2/3 max-w-xl h-55 flex flex-col gap-2 relative">
                    <div className="absolute -left-4 top-1/2 -rotate-90 text-[9px] font-bold text-slate-600 tracking-widest uppercase origin-center">Price Points</div>
                    <div className="h-full w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={history} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                                <XAxis dataKey="time" stroke="#475569" fontSize={10} tickMargin={8} minTickGap={15} />
                                <YAxis yAxisId="price" domain={['auto', 'auto']} stroke="#475569" fontSize={10} tickFormatter={(val) => Math.round(val).toString()} />
                                <YAxis yAxisId="vol" orientation="right" hide />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#3730a3', borderRadius: '0.75rem', padding: '10px' }}
                                    itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                    labelStyle={{ color: '#818cf8', fontSize: '10px', marginBottom: '4px' }}
                                />
                                <Bar yAxisId="vol" dataKey="volume" fill="#1e293b" isAnimationActive={false} name="Volume" />
                                <Line yAxisId="price" type="monotone" dataKey="vwap" stroke="#818cf8" strokeWidth={3} strokeDasharray="5 5" dot={false} name="Terminal VWAP" />
                                <Line yAxisId="price" type="monotone" dataKey="ltp" stroke="#f59e0b" strokeWidth={2} dot={false} name="Screen (LTP)" activeDot={{ r: 6, fill: '#f59e0b', stroke: '#0f172a' }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function QuantDashboard() {
    const [liveData, setLiveData] = useState<any>(null);
    const [structData, setStructData] = useState<any>(null);
    const [scores, setScores] = useState<any>({});
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [indiaVix, setIndiaVix] = useState<number | null>(null);
    const [manualSpot, setManualSpot] = useState<number | null>(null);

    // Re-added missing state variables
    const [liveSpot, setLiveSpot] = useState<number | null>(null);
    const [liveError, setLiveError] = useState<string | null>(null);
    const [liveLoading, setLiveLoading] = useState<boolean>(true);
    
    const [structError, setStructError] = useState<string | null>(null);
    const [structLoading, setStructLoading] = useState<boolean>(true);
    
    const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
    const [availableExpiries, setAvailableExpiries] = useState<string[]>([]);
    
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [copied, setCopied] = useState(false);

    const latestQuantData = useQuantStore((state) => state.latestQuantData);

    // Read mapped values from global store instead of local fetch state
    useEffect(() => {
        if (!latestQuantData || !latestQuantData.rawModelData) return;

        const raw = latestQuantData.rawModelData;

        // Clone history arrays from the global payload to trigger Recharts re-renders
        const gexHist = latestQuantData.gexHistory ? [...latestQuantData.gexHistory] : [];
        const vpcrHist = latestQuantData.vpcrHistory ? [...latestQuantData.vpcrHistory] : [];

        setLiveData({
            spotPrice: raw.spotPrice || raw.spot,
            indiaVix: raw.indiaVix,
            availableExpiries: raw.availableExpiries,
            skew: raw.skew,
            pcr: raw.pcr,
            vpcr: raw.vpcr,
            maxPain: raw.maxPain,
            gex: raw.gex,
            gexHistory: gexHist,
            vpcrHistory: vpcrHist
        });
        setLiveLoading(false);

        setStructData({
            zScore: raw.zScore,
            velocity: raw.velocity,
            ivRank: raw.ivRank,
            niftyBreadth: raw.niftyBreadth,
            midcapBreadthData: raw.midcapBreadthData
        });
        setStructLoading(false);

        if (latestQuantData.modelImpactScores) setScores(latestQuantData.modelImpactScores);
        if (latestQuantData.indiaVix) setIndiaVix(latestQuantData.indiaVix);
        if (latestQuantData.timestamp) setLastUpdated(new Date(latestQuantData.timestamp));

        // Keep window obj updated for export copy function
        if (typeof window !== 'undefined') {
            (window as any)._quantData = raw;
        }

    }, [latestQuantData]);

    const displaySpot = manualSpot !== null ? manualSpot : latestQuantData?.spotPrice;

    // Dummy callback for compatibility
    const handleScoreUpdate = useCallback((key: string, val: number) => {}, []);

    // Explicit override fetch requests (e.g. changing Expiry manually in dropdown)
    useEffect(() => {
        if (manualSpot === null && !selectedExpiry) return; // Ignore on initial mount, rely on global store

        const fetchOverrides = async () => {
            try {
                let url = `/api/quant/live-metrics?asset=NIFTY&t=${Date.now()}`;
                if (manualSpot !== null) url += `&spot=${manualSpot}`;
                if (selectedExpiry) url += `&expiry=${selectedExpiry}`;

                const res = await fetch(url, { cache: 'no-store' });
                const json = await res.json();

                if (!res.ok) throw new Error(json.error || "Failed to fetch override metrics");

                setLiveData((prev: any) => ({ ...prev, ...json }));
                setLiveError(null);
            } catch (err: any) {
                console.error("Live Override Error:", err);
                setLiveError(err.message);
            }
        };

        fetchOverrides();
    }, [manualSpot, selectedExpiry, refreshTrigger]);

    // Callback to populate available expiries - single source of truth
    const handleSetAvailableExpiries = useCallback((expiries: string[]) => {
        if (expiries && expiries.length > 0) {
            setAvailableExpiries(expiries);
        }
    }, []);

    const getExportData = useCallback(() => {
        // Return existing store data since we are no longer generating it here
        return latestQuantData || {};
    }, [latestQuantData]);

    const handleCopy = () => {
        const exportData = getExportData();
        navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Framer Motion constraints
    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
    };

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100 p-4 pb-24 font-sans selection:bg-indigo-500/30">
            {/* Background elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-1/3 left-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-[128px]"></div>
                <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-sky-600/10 rounded-full blur-[128px]"></div>
            </div>

            <div className="w-full max-w-6xl mx-auto relative z-10 mt-8">
                {/* Header */}
                <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="text-center md:text-left">
                        <div className="inline-flex items-center justify-center p-3 bg-white/5 rounded-2xl border border-white/10 mb-5 shadow-xl">
                            <BrainCircuit className="w-8 h-8 text-indigo-400" />
                        </div>
                        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-indigo-300 via-white to-sky-300">
                            Live Quant Assessment
                        </h1>
                        <p className="text-slate-400 text-lg mt-3 max-w-2xl">
                            Real-time institutional-grade option prediction models. Data is computed live from the National Stock Exchange.
                        </p>
                    </div>

                    <div className="flex flex-col items-end gap-3 w-full md:w-auto">
                        <div className="flex items-center justify-end gap-3 w-full md:w-auto">
                            {/* Expiry Selector */}
                            <div className="flex flex-col w-full md:w-48 relative group">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-1">Target Expiry</label>
                                <select
                                    className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer shadow-inner"
                                    value={selectedExpiry || ''}
                                    onChange={(e) => setSelectedExpiry(e.target.value || null)}
                                >
                                    <option value="">Nearest Expiry (Auto) {availableExpiries.length > 0 ? `[${availableExpiries.length}]` : ''}</option>
                                    {availableExpiries.map((exp, i) => (
                                        <option key={`exp-${i}`} value={exp}>{exp}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col w-full md:w-48 relative">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-1">Index Spot Override</label>
                                <input
                                    type="number"
                                    value={manualSpot !== null ? manualSpot : ''}
                                    placeholder={latestQuantData?.spotPrice ? latestQuantData.spotPrice.toString() : "Loading..."}
                                    onChange={(e) => setManualSpot(e.target.value ? parseFloat(e.target.value) : null)}
                                    className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
                                />
                            </div>

                            {/* India VIX Display */}
                            <div className="flex flex-col w-full md:w-32 relative">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-1">India VIX</label>
                                <div className="w-full bg-slate-900/50 border border-slate-800 text-slate-300 text-sm font-bold rounded-xl px-4 py-2.5 shadow-inner flex items-center justify-center">
                                    {indiaVix ? <span className="text-amber-400">{indiaVix.toFixed(2)}</span> : <span className="text-slate-600 animate-pulse">--.--</span>}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 items-center">
                            <button
                                onClick={() => setRefreshTrigger(prev => prev + 1)}
                                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Force Re-sync
                            </button>
                            <button
                                onClick={handleCopy}
                                className={`relative flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all group overflow-hidden ${copied
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                                    : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                    }`}
                            >
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copied ? 'Copied' : 'JSON'}

                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-slate-800 text-slate-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl border border-white/10 pointer-events-none">
                                    Export full raw data payload to clipboard
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 gap-6"
                >
                    {/* Placeholder for the 5 Quant Modules */}
                    <motion.div variants={itemVariants}>
                        <MasterScoreCard scores={scores} lastUpdated={lastUpdated} />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <IVRankCard data={structData?.ivRank} loading={structLoading} error={structError} />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <GEXCard data={liveData?.gex} history={liveData?.gexHistory || []} spotPrice={displaySpot} loading={liveLoading} error={liveError} />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <VolatilitySkewCard data={liveData?.skew} loading={liveLoading} error={liveError} />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <MaxPainCard data={liveData?.maxPain} loading={liveLoading} error={liveError} />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <ZScoreCard data={structData?.zScore} loading={structLoading} error={structError} />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <NiftyBreadthCard
                                data={structData?.niftyBreadth}
                                loading={structLoading}
                                error={structError}
                            />
                            <MidcapBreadthCard
                                data={structData?.niftyBreadth?.midcapBreadth}
                                loading={structLoading}
                                error={structError}
                            />
                        </div>
                    </motion.div>



                    <motion.div variants={itemVariants}>
                        <VelocityCard data={structData?.velocity} loading={structLoading} error={structError} />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <PCRCard data={liveData?.pcr} loading={liveLoading} error={liveError} />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <VPCRCard data={liveData?.vpcr} history={liveData?.vpcrHistory || []} loading={liveLoading} error={liveError} />
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <TerminalVWAPCard />
                    </motion.div>
                </motion.div>
            </div >
        </main >
    );
}
