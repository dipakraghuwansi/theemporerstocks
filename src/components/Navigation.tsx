"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CandlestickChart, BriefcaseBusiness, LineChart, ShieldCheck, ScanSearch, TableProperties, Rows3 } from 'lucide-react';

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
                    href="/screener"
                    className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all ${pathname === '/screener'
                        ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    <ScanSearch className={`w-4 h-4 ${pathname === '/screener' ? 'text-emerald-400' : ''}`} />
                    Screener
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

                <Link
                    href="/auth-test"
                    className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all ${pathname === '/auth-test'
                        ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    <ShieldCheck className={`w-4 h-4 ${pathname === '/auth-test' ? 'text-emerald-400' : ''}`} />
                    Auth Test
                </Link>

                <Link
                    href="/universe"
                    className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all ${pathname === '/universe'
                        ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    <TableProperties className={`w-4 h-4 ${pathname === '/universe' ? 'text-sky-400' : ''}`} />
                    Universe
                </Link>

                <Link
                    href="/sector-breadth"
                    className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all ${pathname === '/sector-breadth'
                        ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    <Rows3 className={`w-4 h-4 ${pathname === '/sector-breadth' ? 'text-emerald-400' : ''}`} />
                    Breadth
                </Link>
            </div>
        </div>
    );
}
