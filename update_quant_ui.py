import re

with open('src/app/quant/page.tsx', 'r') as f:
    text = f.read()

# Make sure Z-score section gets the graph implementation with Reference Lines.
old_z_start = text.find("{/* MODULE 4: STATISTICAL Z-SCORE */}")
old_z_end = text.find("{/* MODULE 3: MAX PAIN - Full Span Column */}")

if old_z_start != -1 and old_z_end != -1:
    old_z_block = text[old_z_start:old_z_end]
    
    NEW_Z_BLOCK = """{/* MODULE 4: STATISTICAL Z-SCORE */}
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
                Approaching <span className="text-rose-400 font-bold">+2.5σ</span> standard deviation bound. Price extension heavily stretched.
            </p>
        </div>"""
    
    text = text.replace(old_z_block, NEW_Z_BLOCK + "\n\n        ")

# Aesthetic Upgrades across Quant page mimicking Strategies:
text = text.replace('bg-[#0a0a0a]', 'bg-slate-950')
text = text.replace('bg-black', 'bg-slate-950')

text = text.replace('bg-zinc-900 border border-zinc-800 p-8 rounded-3xl mb-8 relative overflow-hidden shadow-2xl', 
                    'bg-gradient-to-r from-indigo-900/40 to-indigo-950/40 border border-indigo-500/20 rounded-3xl p-8 mb-8 backdrop-blur-xl relative transition-all duration-300 shadow-[0_0_40px_rgba(99,102,241,0.05)] text-slate-100')

text = text.replace('bg-white/5 border border-white/10 p-6 rounded-2xl', 'bg-[#1a1a2e] border border-white/10 p-6 rounded-3xl overflow-hidden shadow-2xl relative group')

with open('src/app/quant/page.tsx', 'w') as f:
    f.write(text)

print("Quant UI aesthetic updated and Z-Score graph replaced!")
