with open("src/app/quant/page.tsx", "w") as f:
    f.write('''"use client";

import React, { useState } from 'react';
import { Target, Activity, Zap, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

export default function QuantAssessmentTab() {
  const [assetName] = useState('NFO:NIFTY26MAR25600CE');

  // Placeholder data formatting native Intrinsic Max Pain computation simulation 
  const mockMaxPainData = [
    { strike: '25400', oi: 150000 },
    { strike: '25500', oi: 280000 },
    { strike: '25600', oi: 120000 }, // Lowest Intrinsic (Max Pain Point)
    { strike: '25700', oi: 350000 },
    { strike: '25800', oi: 450000 },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans pb-32">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-sky-300 via-white to-emerald-300 bg-clip-text text-transparent flex items-center mb-2">
            <Target className="w-8 h-8 mr-3 text-sky-400" />
            Live Quant Assessment
          </h1>
          <p className="text-slate-400 text-sm flex items-center">
            <Activity className="w-4 h-4 mr-1" />
            5-Module Institutional Options Projection Matrix ({assetName})
          </p>
        </div>
      </div>

      {/* MODULE 0: MASTER TREND SCORE */}
      <div className="bg-gradient-to-r from-indigo-900/40 to-indigo-950/40 border border-indigo-500/20 rounded-3xl p-8 mb-8 backdrop-blur-xl relative transition-all duration-300 shadow-[0_0_40px_rgba(99,102,241,0.05)] text-slate-100 group">
         <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
            <Zap className="w-48 h-48 text-indigo-400" />
         </div>
         <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center">
             Master Trend Engine
         </h2>
         <div className="flex flex-col md:flex-row items-start md:items-end gap-8 relative z-10 w-full">
            <div className="flex items-end gap-4 min-w-[200px]">
                <p className="text-8xl font-mono font-black text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.3)] tracking-tighter">+8.5</p>
            </div>
            
            {/* Visual Gauge Component */}
            <div className="flex-1 w-full space-y-3 pb-2">
                <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2">
                    <span className="text-rose-500">-10 Strong Bear</span>
                    <span className="text-amber-500">0 Neutral</span>
                    <span className="text-emerald-500">+10 Strong Bull</span>
                </div>
                
                {/* Dial Bar */}
                <div className="relative h-4 w-full bg-slate-950/80 rounded-full border border-white/5 overflow-hidden shadow-inner flex">
                    {/* Neutral Zero Center Line */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10"></div>
                     
                    {/* Active Dial Range (Mapping +8.5 on a -10 to +10 scale) */}
                    <div className="absolute left-1/2 h-full bg-gradient-to-r from-emerald-500/50 to-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.8)] rounded-r-full" style={{ width: '42.5%' }}></div>
                    <div className="absolute left-[92.5%] top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_white] z-20 transition-all"></div>
                </div>

                <div className="flex items-center justify-between pt-2">
                   <p className="text-emerald-400 font-bold flex items-center tracking-wide">
                     <TrendingUp className="w-5 h-5 mr-2" /> 
                     Gridlock Execution Condition Reached
                   </p>
                   <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded">
                       Aggregated Confidence: High
                   </p>
                </div>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* MODULE 1: IV RANK (IVR / IVP) */}
        <div className="bg-[#1a1a2e] border border-white/10 p-6 rounded-3xl overflow-hidden shadow-2xl relative group flex flex-col justify-between">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center">
                IV Rank & Percentile
            </h2>
            <div className="mt-4">
                <p className="text-3xl font-mono font-black text-rose-400 font-bold drop-shadow-[0_0_15px_rgba(244,63,94,0.3)]">82%</p>
                <div className="w-full bg-black/50 rounded-full h-2 mt-4 relative border border-white/5">
                   <div className="bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400 h-2 rounded-full absolute top-0 left-0 shadow-[0_0_10px_rgba(244,63,94,0.8)]" style={{ width: '82%' }}></div>
                </div>
                <p className="text-[10px] text-slate-500 mt-6 pt-4 border-t border-white/5 leading-relaxed bg-black/20 p-3 rounded-xl">
                    High IV Environment. Suggests Selling Premium (&gt;80 benchmark).
                </p>
            </div>
        </div>

        {/* MODULE 2: VOLATILITY SKEW */}
        <div className="bg-[#1a1a2e] border border-white/5 p-6 rounded-3xl overflow-hidden shadow-2xl relative group flex flex-col justify-between transition-all duration-300">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center">
                Volatility Skew (Fear)
            </h2>
            
            <div className="flex-1 flex flex-col justify-center">
                <div className="flex justify-between text-xs mb-2">
                    <span className="text-rose-400 font-bold drop-shadow-[0_0_10px_rgba(251,113,133,0.5)]">PE 24.5%</span>
                    <span className="text-emerald-400 font-bold drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">CE 18.2%</span>
                </div>
                
                {/* Visual Ratio Bar Chart */}
                <div className="w-full h-8 bg-black rounded-r-full rounded-l-full overflow-hidden flex border border-white/10 shadow-inner group-hover:border-white/20 transition-all">
                    <div className="h-full bg-gradient-to-r from-rose-600/50 to-rose-400 flex items-center px-4 justify-start shadow-[0_0_15px_rgba(244,63,94,0.4)]" style={{width: '57%'}}>
                       <TrendingDown className="w-4 h-4 text-white opacity-80" />
                    </div>
                    
                    {/* Neutral Split Line */}
                    <div className="h-full w-1 bg-white/50 z-10 shadow-[0_0_5px_white]"></div>
                    
                    <div className="h-full bg-gradient-to-l from-emerald-600/50 to-emerald-400 flex items-center px-4 justify-end shadow-[0_0_15px_rgba(16,185,129,0.4)]" style={{width: '43%'}}>
                       <TrendingUp className="w-4 h-4 text-white opacity-80" />
                    </div>
                </div>
            </div>

            <p className="text-[10px] text-slate-500 mt-6 leading-relaxed bg-black/30 p-3 rounded-xl border border-white/5">
                Put Demand &gt; Call Demand. Indicates downside hedging pressure in NIFTY active contracts. Expect heavy resistance.
            </p>
        </div>


        {/* MODULE 4: STATISTICAL Z-SCORE */}
        <div className="bg-[#1a1a2e] border border-white/5 p-6 rounded-3xl overflow-hidden shadow-2xl relative group flex flex-col justify-between transition-all duration-300">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse mr-2"></span>
                Statistical Z-Score
            </h2>
            <div className="mt-4 flex justify-between items-end gap-4">
                <p className="text-5xl font-mono font-black text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.2)]">+1.85</p>
                <p className="text-[10px] uppercase font-bold text-amber-400/80 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20 mb-1">
                    Mean Reversion
                </p>
            </div>
            
            <div className="h-[100px] w-full mt-6 bg-[#0f0f1b] rounded-xl p-2 pb-0 border border-white/5">
               <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                        { name: "-3", value: 0 },
                        { name: "-2", value: -1.7 },
                        { name: "-1", value: -1.0 },
                        { name: "0", value: 0 },
                        { name: "+1", value: 1.0 },
                        { name: "+2", value: 1.85 },
                        { name: "+3", value: 0 }
                    ]} margin={{top: 10, bottom: 5, right: 10, left: -25}}>
                        <ReferenceLine y={2.5} stroke="#fb7185" strokeDasharray="3 3" opacity={0.6}/>
                        <ReferenceLine y={-2.5} stroke="#34d399" strokeDasharray="3 3" opacity={0.6}/>
                        <XAxis dataKey="name" stroke="#64748b" tick={{fontSize: 10, fill: '#64748b'}} height={15} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" tick={false} tickLine={false} axisLine={false} />
                        <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px'}} />
                        <Bar dataKey="value" fill="#fb7185" radius={[4, 4, 0, 0]} opacity={0.9} />
                    </BarChart>
               </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-slate-500 mt-4 leading-relaxed font-medium">
                Approaching <span className="text-rose-400 font-bold">+2.5&sigma;</span> standard deviation bound. Price extension heavily stretched.
            </p>
        </div>


        {/* MODULE 3: MAX PAIN - Full Span Column */}
        <div className="bg-[#1a1a2e] border border-white/10 p-6 rounded-3xl overflow-hidden shadow-2xl relative group lg:col-span-2">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                Open Interest "Max Pain" (Expirational Pin)
            </h2>
            <div className="flex items-center gap-4 mb-6">
               <div className="text-3xl font-mono font-black text-sky-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.3)]">25600</div>
               <span className="text-[10px] font-bold uppercase tracking-widest bg-sky-500/10 text-sky-400 px-3 py-1.5 rounded-xl border border-sky-500/20">Target Strike</span>
            </div>
            <div className="h-[200px] w-full bg-black/20 rounded-2xl p-4 border border-white/5">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mockMaxPainData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                        <XAxis dataKey="strike" stroke="#64748b" tick={{fill:'#64748b', fontSize: 12}} tickLine={false} axisLine={false} />
                        <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px'}} />
                        <Bar dataKey="oi" fill="#38bdf8" radius={[4, 4, 0, 0]} opacity={0.8} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* MODULE 5: PUT-CALL RATIO (PCR) MOMENTUM */}
        <div className="bg-[#1a1a2e] border border-white/10 p-6 rounded-3xl overflow-hidden shadow-2xl relative group flex flex-col">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                PCR Momentum & GEX
            </h2>
            <div className="mt-2 flex-1 flex flex-col justify-center gap-4">
                <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider mb-1">Total Expiry PCR</span>
                    <span className="text-4xl font-mono font-black text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]">0.85</span>
                </div>
                 
                 <div className="bg-rose-500/5 p-4 rounded-2xl border border-rose-500/10">
                    <span className="text-[10px] font-bold text-rose-500 block mb-1 flex items-center uppercase tracking-wider">
                        <Layers className="w-3 h-3 mr-1" /> Intraday Volume (V-PCR) Spikes
                    </span>
                    <span className="text-2xl font-mono font-black text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]">1.34</span>
                </div>

                 <div className="bg-sky-500/5 p-4 rounded-2xl border border-sky-500/10">
                    <span className="text-[10px] font-bold text-sky-500 block mb-1 uppercase tracking-wider">Dealer Gamma Exposure (GEX)</span>
                    <span className="text-xl font-mono font-black text-sky-400">+4,500,000</span>
                </div>
            </div>
            
            <p className="text-[10px] text-slate-500 mt-6 leading-relaxed bg-black/40 p-3 rounded-xl border border-white/5 font-medium">
                Structural OI remains bullish, immediate Volume/Flow is shifting bearishly (V-PCR &gt; 1.3). Dealers hold positive gamma.
            </p>
        </div>

      </div>
    </main>
  );
}
''')

