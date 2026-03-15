"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CandlestickChart, BriefcaseBusiness, LineChart } from 'lucide-react';

export default function Navigation() {
    const pathname = usePathname();

    return (
        <div className="w-full flex justify-center py-6 sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-white/5">
            <div className="bg-white/5 border border-white/10 rounded-full p-1 flex gap-1 shadow-2xl">
                <Link
                    href="/"
                    className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all ${pathname === '/'
                        ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    <CandlestickChart className={`w-4 h-4 ${pathname === '/' ? 'text-emerald-400' : ''}`} />
                    Stocks
                </Link>

                <Link
                    href="/trade-tracker"
                    className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all ${pathname === '/trade-tracker'
                        ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    <LineChart className={`w-4 h-4 ${pathname === '/trade-tracker' ? 'text-orange-400' : ''}`} />
                    Journal
                </Link>

                <Link
                    href="/positions"
                    className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all ${pathname === '/positions'
                        ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    <BriefcaseBusiness className={`w-4 h-4 ${pathname === '/positions' ? 'text-sky-400' : ''}`} />
                    Positions
                </Link>
            </div>
        </div>
    );
}
