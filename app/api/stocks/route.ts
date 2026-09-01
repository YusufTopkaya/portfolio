import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Err } from "tsentials/errors";
import { Result } from "tsentials/result";
import { withSecurity } from "@/lib/security-wrapper";

// Tickers shown on the retro CRT ticker.
// Free Yahoo quotes are delayed ~15 minutes, which matches the widget's label.
const SYMBOLS = [
  { symbol: "VOO", exchange: "NYSE" },
  { symbol: "GOOGL", exchange: "NASDAQ" },
  { symbol: "MU", exchange: "NASDAQ" },
  { symbol: "RKLB", exchange: "NASDAQ" },
  { symbol: "PLTR", exchange: "NASDAQ" },
];

const REQUEST_TIMEOUT = 10000; // 10 seconds
const QUOTE_TTL_SECONDS = 900; // 15 minutes, mirrors the free-quote delay

export interface StockQuote {
  symbol: string;
  exchange: string;
  price: number;
  changePercent: number;
}

async function fetchQuote(
  symbol: string,
  exchange: string,
): Promise<Result<StockQuote>> {
  return Result.tryAsync(
    async () => {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
        {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
          next: { revalidate: QUOTE_TTL_SECONDS },
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      const meta = json?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      const changePercent = meta?.regularMarketChangePercent;
      if (typeof price !== "number" || typeof changePercent !== "number") {
        throw new Error("Malformed quote payload");
      }
      return { symbol, exchange, price, changePercent };
    },
    () => Err.unexpected("Stocks.QuoteFailed", `Failed to fetch ${symbol}`),
  );
}

async function stocksHandler(_request: NextRequest) {
  const results = await Promise.all(
    SYMBOLS.map(({ symbol, exchange }) => fetchQuote(symbol, exchange)),
  );

  const quotes = results
    .filter((r) => r.ok)
    .map((r) => (r as { value: StockQuote }).value);

  if (quotes.length === 0) {
    return NextResponse.json(
      { error: "Failed to fetch stock quotes" },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { quotes, delayedMinutes: 15 },
    {
      headers: {
        // Server-side fetch cache (revalidate: 900) is enough; the browser
        // must not cache on top of it or staleness could double.
        "Cache-Control": "no-store",
      },
    },
  );
}

export const GET = withSecurity(stocksHandler);
