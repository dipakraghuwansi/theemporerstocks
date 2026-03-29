import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { addJournalTrade, closeJournalTrade, getJournalTrades, syncJournalTrades } from "@/lib/journalStore";
import { getKiteInstance } from "@/lib/kiteHelper";

export async function GET(request: NextRequest) {
  try {
    const sync = request.nextUrl.searchParams.get("sync") === "true";
    let trades = await getJournalTrades();
    let staleQuotes = false;

    if (sync) {
      const cookieStore = await cookies();
      const accessToken = cookieStore.get("kite_access_token")?.value;

      if (accessToken) {
        const openInstruments = Array.from(
          new Set(trades.filter((trade) => trade.status === "OPEN").map((trade) => trade.instrument))
        );

        if (openInstruments.length > 0) {
          const kite = getKiteInstance(accessToken);
          const quotes = await kite.getQuote(openInstruments);
          const priceMap: Record<string, number> = {};

          openInstruments.forEach((instrument) => {
            const quote = quotes[instrument];
            if (quote?.last_price !== undefined) {
              priceMap[instrument] = quote.last_price;
            }
          });

          trades = await syncJournalTrades(priceMap);
        }
      } else {
        staleQuotes = true;
      }
    }

    return NextResponse.json({
      success: true,
      staleQuotes,
      trades,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (
      !body.symbol ||
      !body.instrument ||
      !body.sector ||
      !body.category ||
      !body.screen ||
      !body.direction ||
      !body.entryPrice ||
      !body.stopLoss ||
      !body.targetPrice ||
      !body.thesis
    ) {
      return NextResponse.json({ error: "Missing required journal trade fields." }, { status: 400 });
    }

    const result = await addJournalTrade({
      symbol: body.symbol,
      instrument: body.instrument,
      sector: body.sector,
      category: body.category,
      screen: body.screen,
      direction: body.direction,
      quantity: Number(body.quantity) > 0 ? Number(body.quantity) : 1,
      score: Number(body.score) || 0,
      confidenceLabel: body.confidenceLabel || "Watchlist",
      entryPrice: Number(body.entryPrice),
      stopLoss: Number(body.stopLoss),
      targetPrice: Number(body.targetPrice),
      thesis: body.thesis,
    });

    return NextResponse.json({
      success: true,
      created: result.created,
      trade: result.trade,
      message: result.created ? "Paper buy added to journal." : "An open journal trade already exists for this symbol and screen.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: "Trade id is required." }, { status: 400 });
    }

    const trades = await closeJournalTrade(body.id);
    return NextResponse.json({ success: true, trades });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
