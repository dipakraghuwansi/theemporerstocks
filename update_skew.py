import re

with open('src/app/quant/page.tsx', 'r') as f:
    text = f.read()

old_skew_start = text.find("{/* MODULE 2: VOLATILITY SKEW */}")
old_skew_end = text.find("{/* MODULE 4: STATISTICAL Z-SCORE */}")

if old_skew_start != -1 and old_skew_end != -1:
    old_skew_block = text[old_skew_start:old_skew_end]
    
    NEW_SKEW_BLOCK = """{/* MODULE 2: VOLATILITY SKEW */}
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
        </div>"""
    
    text = text.replace(old_skew_block, NEW_SKEW_BLOCK + "\n\n        ")


with open('src/app/quant/page.tsx', 'w') as f:
    f.write(text)

print("Volatility Skew updated to visual chart comparisons.")
