import React, { useState, useEffect } from "react";
import { ArrowUpRight, ArrowDownRight, Copy, Check, TrendingUp } from "lucide-react";
import { TokenPriceData } from "../types";
import { useLanguage } from "../utils/i18n";

interface TokenCardProps {
  token: TokenPriceData;
  isSelected: boolean;
  onSelect: (token: TokenPriceData) => void;
  baselinePrice?: number;
  botExecutionLaunchedAt?: string | null;
}

export const TokenCard: React.FC<TokenCardProps> = ({
  token,
  isSelected,
  onSelect,
  baselinePrice,
  botExecutionLaunchedAt,
}) => {
  const { t } = useLanguage();
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
  const basePrice = baselinePrice && baselinePrice > 0 ? baselinePrice : token.usdPrice;
  const changeSinceExecution = basePrice > 0
    ? ((token.usdPrice - basePrice) / basePrice) * 100
    : 0;
  const isExecutionPositive = changeSinceExecution >= 0;

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
      {/* Header: Token Info & Dual Percentage Badges */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-slate-800 p-1 flex items-center justify-center overflow-hidden border border-slate-700/60 flex-shrink-0">
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
            <p className="text-xs text-slate-400 truncate max-w-[100px]" title={token.name}>
              {token.name}
            </p>
          </div>
        </div>

        {/* Dual Percentage Change: Desde Ejecución (Estrategia) & 24h */}
        <div className="flex flex-col items-end gap-1">
          {/* % Desde Ejecución del Bot */}
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${
              isExecutionPositive
                ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/50"
                : "bg-rose-950/60 text-rose-300 border-rose-700/50"
            }`}
            title={`Porcentaje de cambio desde el momento de lanzamiento del bot (Precio base: $${formatPrice(basePrice)})`}
          >
            <span className="text-[9px] text-slate-400 font-sans uppercase font-normal">Δ Ejec:</span>
            <span>{changeSinceExecution >= 0 ? "+" : ""}{changeSinceExecution.toFixed(2)}%</span>
          </div>

          {/* % 24h */}
          <div
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono ${
              isPositive
                ? "bg-slate-800/80 text-emerald-400"
                : "bg-slate-800/80 text-rose-400"
            }`}
            title="Porcentaje de cambio en 24 horas"
          >
            <span className="text-slate-500 text-[9px] font-sans">24h:</span>
            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            <span>{Math.abs(token.priceChange24h).toFixed(2)}%</span>
          </div>
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

        {/* Precios Base de Ejecución y Liquidez */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 pt-1 border-t border-slate-800/40">
          <span>Base Ejec.:</span>
          <span className="font-mono text-cyan-300 font-medium">${formatPrice(basePrice)}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
          <span>{t("dexLiquidity")}</span>
          <span className="font-mono text-slate-300">{formatLiquidity(token.liquidity)}</span>
        </div>
      </div>

      {/* Footer: Mint Address */}
      <div className="pt-2.5 border-t border-slate-800/70 flex items-center justify-between gap-2 text-xs">
        <button
          onClick={copyMint}
          className="flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          title={`${t("copyMint")}: ${token.mint}`}
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>
            {token.mint.substring(0, 4)}...{token.mint.substring(token.mint.length - 4)}
          </span>
        </button>
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
          Jupiter DEX
        </span>
      </div>
    </div>
  );
};
