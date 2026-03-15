import re

with open('src/app/quant/page.tsx', 'r') as f:
    text = f.read()

old_master_start = text.find("{/* MODULE 0: MASTER TREND SCORE */}")
old_master_end = text.find("{/* MODULE 1: IV RANK (IVR / IVP) */}")

if old_master_start != -1 and old_master_end != -1:
    old_master_block = text[old_master_start:old_master_end]
    
    NEW_MASTER_BLOCK = """{/* MODULE 0: MASTER TREND SCORE */}
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
      </div>"""
    
    text = text.replace(old_master_block, NEW_MASTER_BLOCK + "\n\n      ")


with open('src/app/quant/page.tsx', 'w') as f:
    f.write(text)

