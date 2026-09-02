"use client";

import { useEffect, useState } from "react";

interface StockQuote {
  symbol: string;
  exchange: string;
  price: number;
  changePercent: number;
}

const REFETCH_INTERVAL_MS = 15 * 60 * 1000; // 15 min, matches free-quote delay
const ROTATE_INTERVAL_MS = 1500; // each ticker stays on screen 1.5s

/**
 * Mini retro desktop PC (flat case + CRT monitor).
 * Desktop: floating at bottom-left. Mobile: a slim ticker bar pinned to the
 * bottom edge instead. The screen cycles through 15-minute-delayed quotes
 * served by /api/stocks; the monitor power button really switches the CRT
 * screen on/off with a mini tube power animation.
 */
export function RetroStockComputer() {
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [screenOn, setScreenOn] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // no-store: the server already caches quotes for 15 min; a browser
        // cache on top would double the staleness window.
        const res = await fetch("/api/stocks", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setQuotes(data.quotes ?? []);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    load();
    const refetch = setInterval(load, REFETCH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(refetch);
    };
  }, []);

  useEffect(() => {
    if (quotes.length === 0) return;
    const rotate = setInterval(
      () => setIndex((i) => (i + 1) % quotes.length),
      ROTATE_INTERVAL_MS,
    );
    return () => clearInterval(rotate);
  }, [quotes.length]);

  const quote = quotes[index];
  const up = (quote?.changePercent ?? 0) >= 0;
  const toggleScreen = () => setScreenOn((on) => !on);

  const tickerText = quote
    ? `${quote.symbol} $${quote.price.toFixed(2)} ${up ? "▲" : "▼"}${Math.abs(quote.changePercent).toFixed(2)}%`
    : "TUNING...";

  return (
    <>
      {/* ── Mobile: slim ticker bar pinned to the bottom edge ── */}
      <div
        id="retro-ticker-bar"
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-3 md:hidden"
        style={{
          height: 44,
          background: "linear-gradient(180deg, #0d1f0a 0%, #050d04 100%)",
          borderTop: "3px solid #8f8672",
          fontFamily: "var(--font-press-start), monospace",
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 7, color: "#6e8f50" }}>YT-88</span>
          <button
            type="button"
            id="ticker-start-btn"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("twingo:start"))
            }
            aria-label="Start the Twingo racer game"
            className="cursor-pointer"
            style={{
              fontSize: 7,
              color: "#92cc41",
              background: "transparent",
              border: "1px solid #6e8f50",
              padding: "2px 6px",
              fontFamily: "inherit",
            }}
          >
            START
          </button>
        </div>
        <span
          style={{
            fontSize: 9,
            color: failed ? "#e76e55" : "#d7ff9e",
            textShadow: "0 0 6px rgba(146,204,65,0.8)",
          }}
        >
          {failed ? "SIGNAL LOST" : tickerText}
        </span>
        <span style={{ fontSize: 6, color: "#6e8f50" }}>15M</span>
        {/* scanlines */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 1px, transparent 1px 3px)",
          }}
        />
      </div>
      {/* keep page bottom content (footer, privacy link) clear of the
          fixed mobile ticker bar */}
      <div className="md:hidden" style={{ height: 44 }} aria-hidden="true" />

      {/* ── Desktop: floating CRT PC at bottom-left ── */}
      <div
        id="retro-crt-pc"
        className="fixed bottom-3 left-3 z-50 hidden flex-col items-center select-none md:flex"
      >
        {/* CRT monitor */}
        <div
          className="rounded-md p-2 pb-1"
          style={{
            background: "linear-gradient(180deg, #e5dfcc 0%, #cfc7ae 100%)",
            border: "3px solid #8f8672",
            boxShadow:
              "inset 2px 2px 0 rgba(255,255,255,0.5), inset -2px -2px 0 rgba(0,0,0,0.25), 0 10px 24px rgba(0,0,0,0.45)",
          }}
        >
          {/* dark bezel */}
          <div
            style={{
              background: "#26241f",
              border: "2px solid #111",
              borderRadius: 8,
              padding: 5,
              boxShadow: "inset 0 2px 6px rgba(0,0,0,0.8)",
            }}
          >
            {/* screen — fills the bezel exactly, slight curvature via radius */}
            <div
              className="relative overflow-hidden"
              style={{
                width: 190,
                height: 118,
                background:
                  "radial-gradient(ellipse at center, #0d1f0a 0%, #050d04 75%)",
                borderRadius: "10% / 14%",
                boxShadow: "inset 0 0 18px rgba(0,0,0,0.9)",
              }}
            >
              {screenOn ? (
                /* keyed so the power-on animation replays on every toggle */
                <div key="on" className="crt-screen-on absolute inset-0">
                  {/* ticker content */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center"
                    style={{
                      fontFamily: "var(--font-press-start), monospace",
                      textShadow: "0 0 6px rgba(146,204,65,0.8)",
                    }}
                  >
                    {failed ? (
                      <span style={{ fontSize: 7, color: "#e76e55" }}>
                        SIGNAL LOST
                      </span>
                    ) : quote ? (
                      <>
                        <span
                          style={{
                            fontSize: 6,
                            color: "#92cc41",
                            opacity: 0.8,
                          }}
                        >
                          {quote.exchange}
                        </span>
                        <span style={{ fontSize: 13, color: "#d7ff9e" }}>
                          {quote.symbol}
                        </span>
                        <span style={{ fontSize: 10, color: "#d7ff9e" }}>
                          ${quote.price.toFixed(2)}
                        </span>
                        <span
                          style={{
                            fontSize: 8,
                            color: up ? "#92cc41" : "#e76e55",
                          }}
                        >
                          {up ? "▲" : "▼"}{" "}
                          {Math.abs(quote.changePercent).toFixed(2)}%
                        </span>
                        <span
                          style={{
                            fontSize: 5,
                            color: "#92cc41",
                            opacity: 0.6,
                          }}
                        >
                          15 MIN DELAY
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: 7, color: "#92cc41" }}>
                        TUNING...
                      </span>
                    )}
                  </div>
                  {/* scanlines */}
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 1px, transparent 1px 3px)",
                      borderRadius: "inherit",
                    }}
                  />
                  {/* glass glare */}
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(ellipse 60% 35% at 30% 12%, rgba(255,255,255,0.10) 0%, transparent 70%)",
                      borderRadius: "inherit",
                    }}
                  />
                </div>
              ) : (
                /* bright line collapsing into a dot, then black */
                <div key="off" className="crt-screen-off absolute inset-0" />
              )}
            </div>
          </div>
          {/* monitor branding strip + real power button */}
          <div
            className="mt-1 flex items-center justify-between px-1"
            style={{ fontFamily: "var(--font-press-start), monospace" }}
          >
            <span style={{ fontSize: 6, color: "#6e6650" }}>YT-88</span>
            <button
              type="button"
              id="crt-start-btn"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("twingo:start"))
              }
              aria-label="Start the Twingo racer game"
              className="cursor-pointer"
              style={{
                fontSize: 6,
                color: "#92cc41",
                background: "#1c1a16",
                border: "1px solid #6e6650",
                padding: "2px 7px",
                fontFamily: "inherit",
                textShadow: "0 0 4px rgba(146,204,65,0.8)",
              }}
            >
              ▶ START
            </button>
            <button
              type="button"
              onClick={toggleScreen}
              aria-label={screenOn ? "Turn monitor off" : "Turn monitor on"}
              className="cursor-pointer"
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: screenOn ? "#92cc41" : "#e76e55",
                  boxShadow: screenOn
                    ? "0 0 4px #92cc41"
                    : "0 0 2px rgba(231,110,85,0.5)",
                  opacity: screenOn ? 1 : 0.6,
                }}
              />
            </button>
          </div>
        </div>

        {/* monitor stand */}
        <div
          style={{
            width: 70,
            height: 8,
            background: "#b8b09a",
            border: "2px solid #8f8672",
            borderTop: "none",
          }}
        />

        {/* horizontal desktop case */}
        <div
          className="flex items-center gap-2 rounded-sm px-3"
          style={{
            width: 240,
            height: 44,
            background: "linear-gradient(180deg, #e5dfcc 0%, #c9c1a9 100%)",
            border: "3px solid #8f8672",
            boxShadow:
              "inset 2px 2px 0 rgba(255,255,255,0.5), inset -2px -2px 0 rgba(0,0,0,0.25)",
          }}
        >
          {/* floppy drive */}
          <div
            style={{
              width: 70,
              height: 11,
              background: "#3a372e",
              border: "2px solid #8f8672",
              boxShadow: "inset 0 2px 3px rgba(0,0,0,0.6)",
            }}
          />
          {/* vent lines */}
          <div className="flex flex-1 flex-col gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{ height: 2, background: "#a29a82", width: "100%" }}
              />
            ))}
          </div>
          {/* case power button + LED (also toggles the monitor) */}
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: "#f7d51d",
                boxShadow: screenOn ? "0 0 4px #f7d51d" : "none",
                opacity: screenOn ? 1 : 0.4,
              }}
            />
            <button
              type="button"
              onClick={toggleScreen}
              aria-label={screenOn ? "Power off" : "Power on"}
              className="cursor-pointer"
              style={{
                width: 13,
                height: 13,
                background: "#b8b09a",
                border: "2px solid #8f8672",
                boxShadow: screenOn
                  ? "inset -2px -2px 0 rgba(0,0,0,0.3)"
                  : "inset 2px 2px 0 rgba(0,0,0,0.3)",
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
