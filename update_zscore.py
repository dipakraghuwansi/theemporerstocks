with open("src/app/quant/page.tsx", "r") as f:
    text = f.read()

ZSCORE_REPLACEMENT = """
        {/* MODULE 4: STATISTICAL Z-SCORE */}
        <div className="bg-zinc-800/50 border border-zinc-700 p-6 rounded-2xl flex flex-col justify-between">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-2">
                Statistical Z-Score
            </h2>
            <div className="mt-4 flex gap-4 items-end">
                <p className="text-4xl font-mono font-black text-amber-400">+1.85</p>
                <p className="text-xs text-slate-400 mb-1 font-medium bg-amber-500/10 px-2 py-1 rounded">Mean Reversion Alert</p>
            </div>
            
            <div className="h-[80px] w-full mt-4">
               <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                        { name: "-3", value: 0 },
                        { name: "-2", value: -1.7 },
                        { name: "-1", value: -1.0 },
                        { name: "0", value: 0 },
                        { name: "+1", value: 1.0 },
                        { name: "+2", value: 1.85 }, // CURRENT ALERT
                        { name: "+3", value: 0 }
                    ]} margin={{top: 0, bottom: 0, right: 0, left: -20}}>
                        <ReferenceLine y={2.5} stroke="#fb7185" strokeDasharray="3 3" />
                        <ReferenceLine y={-2.5} stroke="#34d399" strokeDasharray="3 3" />
                        <XAxis dataKey="name" stroke="#64748b" tick={{fontSize: 10}} height={15} />
                        <RechartsTooltip cursor={{fill: '#1e293b'}} contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155'}} />
                        <Bar 
                           dataKey="value" 
                           fill="#fb7185" /* Reverting red since high */ 
                           radius={[4, 4, 0, 0]} 
                           opacity={0.8}
                        />
                    </BarChart>
               </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
                Approaching +2.5 standard deviation bound. Price extension stretched cleanly over 20-Day SMA.
            </p>
        </div>
"""

old_block_start = "{/* MODULE 4: STATISTICAL Z-SCORE */}"
old_block_end = "{/* MODULE 3: MAX PAIN - Full Span Column */}"

start_idx = text.find(old_block_start)
end_idx = text.find(old_block_end)

if start_idx != -1 and end_idx != -1:
    new_text = text[:start_idx] + ZSCORE_REPLACEMENT + "\n        " + text[end_idx:]
    with open("src/app/quant/page.tsx", "w") as f:
        f.write(new_text)
    print("Z-Score chart added!")
else:
    print("Could not find Z-score block")
