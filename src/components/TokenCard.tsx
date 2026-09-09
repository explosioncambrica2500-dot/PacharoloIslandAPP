import React, { useState, useEffect } from "react";
import { ArrowUpRight, ArrowDownRight, Bell, Copy, Check, TrendingUp } from "lucide-react";
import { TokenPriceData } from "../types";

interface TokenCardProps {
  token: TokenPriceData;
  isSelected: boolean;
  onSelect: (token: TokenPriceData) => void;
  onQuickAlert: (token: TokenPriceData) => void;
  activeAlertCount: number;
}

export const TokenCard: React.FC<TokenCardProps> = ({
  token,
  isSelected,
  onSelect,
  onQuickAlert,
  activeAlertCount,
}) => {
  const [copied, setCopied] = useState(false);
  const [tickDirection, setTickDirection] = useState<"up" | "down" | null>(null);

  // Watch for price ticks
  useEffect(() => {
    if (token.previousPrice && token.previousPrice !== token.usdPrice) {
      const dir = token.usdPrice > token.previousPrice ? "up" : "down";
      setTickDirection(dir);
      const timer = setTimeout(() => setTickDirection(null), 1200);
      return () => clearTimeout(timer);
    }
  }, [token.usdPrice, token.previousPrice]);

  const copyMint = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(token.mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPositive = token.priceChange24h >= 0;

  // Formatting helpers
  const formatPrice = (p: number) => {
    if (p >= 1000) {
      return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (p >= 1) {
      return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    return p.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  };

  const formatLiquidity = (liq: number) => {
    if (liq >= 1e9) return `$${(liq / 1e9).toFixed(2)}B`;
    if (liq >= 1e6) return `$${(liq / 1e6).toFixed(2)}M`;
    if (liq >= 1e3) return `$${(liq / 1e3).toFixed(1)}K`;
    return `$${liq.toFixed(0)}`;
  };

  return (
    <div
      id={`token-card-${token.symbol.toLowerCase()}`}
      onClick={() => onSelect(token)}
      className={`group relative rounded-xl p-4 transition-all duration-300 cursor-pointer border text-left ${
        isSelected
          ? "bg-slate-900 border-cyan-500/80 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/30"
          : "bg-slate-900/60 hover:bg-slate-900 border-slate-800 hover:border-slate-700"
      } ${
        tickDirection === "up"
          ? "ring-2 ring-emerald-500/60 bg-emerald-950/20"
          : tickDirection === "down"
          ? "ring-2 ring-rose-500/60 bg-rose-950/20"
          : ""
      }`}
    >
      {/* Active Alert Indicator Pill */}
      {activeAlertCount > 0 && (
        <span
          title={`${activeAlertCount} alerta(s) activa(s) para ${token.symbol}`}
          className="absolute -top-2 -right-1 z-10 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold flex items-center gap-1 shadow-sm"
        >
          <Bell className="w-2.5 h-2.5" />
          {activeAlertCount}
        </span>
      )}

      {/* Header: Token Info */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-slate-800 p-1 flex items-center justify-center overflow-hidden border border-slate-700/60">
            {token.icon ? (
              <img
                src={token.icon}
                alt={token.symbol}
                className="w-full h-full object-contain rounded-full"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <TrendingUp className="w-5 h-5 text-cyan-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white tracking-wide text-base">{token.symbol}</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                Solana
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate max-w-[120px]" title={token.name}>
              {token.name}
            </p>
          </div>
        </div>

        {/* 24h Change Pill */}
        <div
          className={`flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-semibold ${
            isPositive
              ? "bg-emerald-950/50 text-emerald-400 border border-emerald-800/40"
              : "bg-rose-950/50 text-rose-400 border border-rose-800/40"
          }`}
        >
          {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          <span>{Math.abs(token.priceChange24h).toFixed(2)}%</span>
        </div>
      </div>

      {/* Price Display */}
      <div className="mb-3">
        <div className="flex items-baseline gap-1">
          <span className="text-xs text-slate-400 font-mono">$</span>
          <span
            className={`text-2xl font-bold tracking-tight font-mono transition-colors duration-300 ${
              tickDirection === "up"
                ? "text-emerald-300"
                : tickDirection === "down"
                ? "text-rose-300"
                : "text-white"
            }`}
          >
            {formatPrice(token.usdPrice)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
          <span>Liquidez DEX:</span>
          <span className="font-mono text-slate-300">{formatLiquidity(token.liquidity)}</span>
        </div>
      </div>

      {/* Footer: Mint Address and Quick Action */}
      <div className="pt-2.5 border-t border-slate-800/70 flex items-center justify-between gap-2 text-xs">
        <button
          onClick={copyMint}
          className="flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          title={`Copiar Mint: ${token.mint}`}
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>
            {token.mint.substring(0, 4)}...{token.mint.substring(token.mint.length - 4)}
          </span>
        </button>

        <button
          id={`quick-alert-${token.symbol.toLowerCase()}`}
          onClick={(e) => {
            e.stopPropagation();
            onQuickAlert(token);
          }}
          className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-[11px]"
          title="Crear alerta de precio"
        >
          <Bell className="w-3 h-3 text-amber-400" />
          <span>Alerta</span>
        </button>
      </div>
    </div>
  );
};
