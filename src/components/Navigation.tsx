"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { CandlestickChart, BriefcaseBusiness, LineChart, ShieldCheck, ScanSearch, TableProperties, Rows3, Sigma, Database, RefreshCw, Microscope } from 'lucide-react';

export default function Navigation() {
    const pathname = usePathname();
    const [isBuildingDayCache, setIsBuildingDayCache] = useState(false);
    const [isBackfillingYear, setIsBackfillingYear] = useState(false);
    const [buildMessage, setBuildMessage] = useState('');

    const buildDayFoundation = async () => {
        setIsBuildingDayCache(true);
        setBuildMessage('');

        try {
            const res = await fetch('/api/stocks/research/foundation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    interval: 'day',
                    lookbackDays: 180,
                    category: 'all',
                    maxSymbols: 201,
                    refresh: false,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setBuildMessage(data.error || 'Build failed');
                return;
            }

            setBuildMessage(`Day cache ready: ${data.fetched || 0} fetched, ${data.cached || 0} cached`);
            window.setTimeout(() => setBuildMessage(''), 4000);
        } catch (error) {
            console.error('Failed to build day foundation from nav', error);
            setBuildMessage('Network error');
        } finally {
            setIsBuildingDayCache(false);
        }
    };

    const buildYearFoundation = async () => {
        setIsBackfillingYear(true);
        setBuildMessage('');

        try {
            const res = await fetch('/api/stocks/research/foundation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    interval: 'day',
                    lookbackDays: 365,
                    category: 'all',
                    maxSymbols: 250,
                    refresh: false,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setBuildMessage(data.error || '365d backfill failed');
                return;
            }

            setBuildMessage(`365d cache ready: ${data.fetched || 0} fetched, ${data.cached || 0} cached, ${data.failed || 0} failed`);
            window.setTimeout(() => setBuildMessage(''), 5000);
        } catch (error) {
            console.error('Failed to build 365d foundation from nav', error);
            setBuildMessage('Network error');
        } finally {
            setIsBackfillingYear(false);
        }
    };

    return (
        <div className="w-full flex justify-center py-6 sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-white/5">
            <div className="flex flex-col items-center gap-2">
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

                <Link
                    href="/options-structure"
                    className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all ${pathname === '/options-structure'
                        ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    <Sigma className={`w-4 h-4 ${pathname === '/options-structure' ? 'text-sky-400' : ''}`} />
                    Options
                </Link>

                <Link
                    href="/research"
                    className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all ${pathname === '/research'
                        ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] border border-white/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    <Microscope className={`w-4 h-4 ${pathname === '/research' ? 'text-emerald-400' : ''}`} />
                    Research
                </Link>
            </div>
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={buildDayFoundation}
                    disabled={isBuildingDayCache}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isBuildingDayCache ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                    Build Day Cache
                </button>
                <button
                    type="button"
                    onClick={buildYearFoundation}
                    disabled={isBackfillingYear}
                    className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isBackfillingYear ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                    Backfill 365d
                </button>
                {buildMessage ? <span className="text-xs text-slate-300">{buildMessage}</span> : null}
            </div>
            </div>
        </div>
    );
}
