import re
with open("src/app/quant/page.tsx", "r") as f:
    text = f.read()

Z_SCORE_REPLACEMENT = """        {/* MODULE 4: STATISTICAL Z-SCORE */}
        <div className="bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden shadow-2xl relative group p-6 flex flex-col justify-between">
            <h2 className="text-[10px] font-bold text-sky-400 uppercase tracking-widest mb-2 flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse mr-2"></span>
                Statistical Z-Score
            </h2>
            <div className="mt-4 flex justify-between items-end gap-4">
                <p className="text-5xl font-mono font-black text-amber-500 drop-shadow-md">+1.85</p>
                <p className="text-[10px] uppercase font-bold text-amber-400/80 bg-amber-500/20 px-3 py-1.5 rounded-xl border border-amber-500/20 mb-1">
                    Mean Reversion
                </p>
            </div>
            
            <div className="h-[100px] w-full mt-6 bg-black/20 rounded-xl">
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
                        <RechartsTooltip cursor={{fill: '#1e293b'}} contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px'}} />
                        <Bar dataKey="value" fill="#fb7185" radius={[4, 4, 0, 0]} opacity={0.9} />
                    </BarChart>
               </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-400 mt-4 leading-relaxed">
                Approaching +2.5 standard deviation bound. Price extension heavily stretched above 20-Day SMA.
            </p>
        </div>"""

# Replace Z-Score block
old_z_start = text.find("{/* MODULE 4: STATISTICAL Z-SCORE */}")
old_z_end = text.find("{/* MODULE 3: MAX PAIN - Full Span Column */}")

if old_z_start != -1 and old_z_end != -1:
    text = text[:old_z_start] + Z_SCORE_REPLACEMENT + "\n\n        " + text[old_z_end:]
    
# Dark UI / Strategies mapping styles overrides -> rounded-3xl, bg-slate-900/50 etc
text = text.replace('bg-black', 'bg-slate-950 selection:bg-sky-500/30')
text = text.replace('bg-zinc-900 border border-zinc-800', 'bg-slate-900/50 border border-white/5')
text = text.replace('bg-white/5 border border-white/10 p-6 rounded-2xl', 'bg-slate-900/50 border border-white/5 p-6 rounded-3xl overflow-hidden shadow-2xl relative group')

with open("src/app/quant/page.tsx", "w") as f:
    f.write(text)

