"use client";

import { useEffect, useRef, useState } from "react";
import { useQuantStore } from "@/lib/quantStore";
import { io } from "socket.io-client";

export default function GlobalQuantEngine() {
    const isFetchingStruct = useRef(false);
    const [needsLogin, setNeedsLogin] = useState(false);

    useEffect(() => {
        // --- 1. Fetch Structural Metrics (Daily Data) every 5 minutes ---
        const fetchStructural = async () => {
            if (isFetchingStruct.current) return;
            isFetchingStruct.current = true;
            try {
                const structRes = await fetch(`/api/quant/structural-metrics?asset=NIFTY&t=${Date.now()}`);
                if (structRes.status === 401) {
                    setNeedsLogin(true);
                    return;
                }
                if (!structRes.ok) return;
                const struct = await structRes.json();
                
                const { latestQuantData, setLatestQuantData } = useQuantStore.getState();
                setLatestQuantData({
                    ...(latestQuantData || {}),
                    structural: struct
                });
            } catch (error) {
                console.error("Structural Engine fetch failed:", error);
            } finally {
                isFetchingStruct.current = false;
            }
        };

        fetchStructural();
        const structInterval = setInterval(fetchStructural, 5 * 60 * 1000);

        // --- 2. Connect to standalone WebSocket for Live Metrics ---
        const socket = io("http://localhost:8080");

        socket.on("connect", () => {
            console.log("Connected to Quant WS Engine");
            
            // To pass the access token, we can fetch it via an API since document.cookie is HttpOnly
            fetch('/api/kite/token').then(r => r.json()).then(data => {
                if (data.token) {
                    setNeedsLogin(false);
                    fetch('http://localhost:8080/set-token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: data.token })
                    }).catch(e => console.error("Failed to push token to WS", e));
                } else {
                    setNeedsLogin(true);
                }
            }).catch(e => console.error(e));
        });

        socket.on("update", (live: any) => {
            const { latestQuantData, setLatestQuantData } = useQuantStore.getState();
            const struct = latestQuantData?.structural || {};

            // Aggregate scores...
            let totalScore = 0;
            const scores: Record<string, number> = {};
            const safeAdd = (key: string, obj: any) => {
                if (obj && obj.score !== undefined) {
                    scores[key] = obj.score;
                    totalScore += obj.score;
                }
            };

            safeAdd("skew", live.skew);
            safeAdd("pcr", live.pcr);
            safeAdd("vpcr", live.vpcr);
            safeAdd("maxPain", live.maxPain);
            safeAdd("gex", live.gex);
            safeAdd("zscore", struct.zScore);
            safeAdd("velocity", struct.velocity);
            safeAdd("niftyBreadth", struct.niftyBreadth);

            const payload = {
                timestamp: live.timestamp,
                indiaVix: live.indiaVix || 0,
                spotPrice: live.spotPrice || 0,
                daysToExpiry: live.skew?.daysToExpiry,
                pcrRatio: live.pcr?.pcr,
                vpcrRatio: live.vpcr?.vpcr,
                velocityTrend: struct.velocity?.velocityStatus,
                ivRankStatus: struct.ivRank?.interpretation,
                masterTrendScore: totalScore,
                modelImpactScores: scores,
                rawModelData: { ...live, ...struct },
                structural: struct
            };

            const gexHistory = latestQuantData?.gexHistory ? [...latestQuantData.gexHistory] : [];
            const vpcrHistory = latestQuantData?.vpcrHistory ? [...latestQuantData.vpcrHistory] : [];

            if (live.gex && live.gex.netGexScore !== undefined) {
                const newNetGex = parseFloat(live.gex.netGexScore);
                const currentTimeStr = new Date(live.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                let gexMomentum = 0;
                const isSameMinute = gexHistory.length > 0 && gexHistory[gexHistory.length - 1].time === currentTimeStr;
                
                // Compare with the last *different* minute for true momentum, or simply the previous known point
                if (gexHistory.length > 0) {
                    const referencePoint = isSameMinute && gexHistory.length > 1 
                        ? gexHistory[gexHistory.length - 2] 
                        : gexHistory[gexHistory.length - 1];
                    gexMomentum = newNetGex - referencePoint.netGex;
                }

                const newPoint = {
                    time: currentTimeStr,
                    netGex: newNetGex,
                    gexMomentum: gexMomentum,
                };

                if (isSameMinute) {
                    // Update the current minute's final value, preserving the momentum calculated against the previous minute
                    gexHistory[gexHistory.length - 1] = newPoint;
                } else {
                    gexHistory.push(newPoint);
                }
                if (gexHistory.length > 40) gexHistory.shift();
            }

            if (live.vpcr && live.vpcr.totalCallVolume !== undefined) {
                const currentTimeStr = new Date(live.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                let callMomentum = 0;
                let putMomentum = 0;
                const isSameMinute = vpcrHistory.length > 0 && vpcrHistory[vpcrHistory.length - 1].time === currentTimeStr;

                if (vpcrHistory.length > 0) {
                    const referencePoint = isSameMinute && vpcrHistory.length > 1 
                        ? vpcrHistory[vpcrHistory.length - 2] 
                        : vpcrHistory[vpcrHistory.length - 1];
                    callMomentum = live.vpcr.totalCallVolume - referencePoint.callVol;
                    putMomentum = live.vpcr.totalPutVolume - referencePoint.putVol;
                }

                const newPoint = {
                    time: currentTimeStr,
                    callVol: live.vpcr.totalCallVolume,
                    putVol: live.vpcr.totalPutVolume,
                    vpcr: parseFloat(live.vpcr.vpcr || '0'),
                    callMomentum: callMomentum,
                    putMomentum: putMomentum
                };

                if (isSameMinute) {
                    vpcrHistory[vpcrHistory.length - 1] = newPoint;
                } else {
                    vpcrHistory.push(newPoint);
                }
                if (vpcrHistory.length > 40) vpcrHistory.shift();
            }

            setLatestQuantData({ ...payload, gexHistory, vpcrHistory });
        });

        return () => {
            clearInterval(structInterval);
            socket.disconnect();
        };
    }, []);

    if (needsLogin) {
        return (
            <div className="fixed bottom-6 right-6 z-[9999] bg-rose-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 border border-rose-400 backdrop-blur-md">
                <div className="text-sm font-bold tracking-wide">
                    ⚠️ KITE AUTHENTICATION REQUIRED
                    <div className="text-rose-200 font-medium text-xs mt-1">Connect your broker to start the live data stream</div>
                </div>
                <a 
                    href="/api/kite/login" 
                    className="bg-white text-rose-600 px-6 py-2 rounded-xl text-sm font-black hover:bg-slate-100 hover:scale-105 transition-all shadow-lg"
                >
                    Login to Kite
                </a>
            </div>
        );
    }

    return null;
}
