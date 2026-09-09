import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import {
  Maximize2,
  TrendingUp,
  Clock,
  Bell,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { TokenPriceData, AlertRule, TimeFrame } from "../types";
import { useLanguage } from "../utils/i18n";

interface PriceChartProps {
  token: TokenPriceData;
  activeAlerts: AlertRule[];
  onOpenAlertModal: () => void;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  token,
  activeAlerts,
  onOpenAlertModal,
}) => {
  const { t } = useLanguage();
  const [timeframe, setTimeframe] = useState<TimeFrame>("5M");

  // Generate synthetic smooth timeframe points anchored to live Jupiter price
  const chartData = useMemo(() => {
    const pointsCount = timeframe === "1M" ? 15 : timeframe === "5M" ? 30 : timeframe === "15M" ? 45 : timeframe === "1H" ? 60 : 80;
    const intervalMinutes = timeframe === "1M" ? 0.2 : timeframe === "5M" ? 0.5 : timeframe === "15M" ? 1.5 : timeframe === "1H" ? 5 : 18;
    const now = Date.now();
    const result: { timestamp: number; time: string; price: number }[] = [];

    const basePrice = token.usdPrice;
    // Determine realistic volatility scale based on token
    const volatilityPct = token.symbol === "BTC" ? 0.003 : token.symbol === "ETH" ? 0.005 : token.symbol === "SOL" ? 0.007 : 0.012;

    for (let i = pointsCount - 1; i >= 0; i--) {
      const pointDate = new Date(now - i * intervalMinutes * 60000);
      // Continuous wave + random walk leading exactly to current price at i = 0
      const drift = (pointsCount - i) / pointsCount;
      const wave = Math.sin((i / 4) + (token.symbol.charCodeAt(0) % 5)) * 0.7;
      const noise = ((Math.sin(i * 997) + 1) / 2 - 0.5) * 0.5;
      const offset = (wave + noise) * basePrice * volatilityPct * (i === 0 ? 0 : 1);
      const price = Number((basePrice + offset).toFixed(basePrice > 100 ? 2 : 4));

      const timeLabel =
        timeframe === "24H"
          ? pointDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
          : pointDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      result.push({
        timestamp: pointDate.getTime(),
        time: timeLabel,
        price: i === 0 ? basePrice : price,
      });
    }

    return result;
  }, [token.usdPrice, token.symbol, timeframe]);

  const prices = chartData.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceSpread = maxPrice - minPrice;
  const yDomainMin = Number((minPrice - priceSpread * 0.08).toFixed(basePricePrecision(minPrice)));
  const yDomainMax = Number((maxPrice + priceSpread * 0.08).toFixed(basePricePrecision(maxPrice)));

  function basePricePrecision(p: number) {
    if (p >= 1000) return 2;
    if (p >= 1) return 3;
    return 5;
  }

  // Active alerts for this token
  const tokenAlerts = activeAlerts.filter((a) => a.symbol === token.symbol && a.isActive);

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 lg:p-5 flex flex-col gap-4 backdrop-blur-sm">
      {/* Chart Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center p-1 border border-slate-700">
            <img
              src={token.icon}
              alt={token.symbol}
              className="w-full h-full object-contain rounded-full"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">{token.name}</h2>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                {token.symbol}/USD
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>{t("source")} {token.source}</span>
              {token.blockId && <span>{t("block")} #{token.blockId}</span>}
            </div>
          </div>
        </div>

        {/* Timeframe selector & actions */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
            {(["1M", "5M", "15M", "1H", "24H"] as TimeFrame[]).map((tf) => (
              <button
                key={tf}
                id={`timeframe-${tf.toLowerCase()}`}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  timeframe === tf
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            onClick={onOpenAlertModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium transition-colors"
            title={t("manageAlerts")}
          >
            <Bell className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t("createAlertBtn")}</span>
          </button>

          <a
            href={`https://jup.ag/swap/USDC-${token.mint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors"
            title="Jupiter DEX"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Jupiter</span>
          </a>
        </div>
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 text-xs">
        <div>
          <span className="text-slate-400 block text-[11px]">{t("currentPrice")}</span>
          <span className="text-base font-bold text-white font-mono">
            ${token.usdPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block text-[11px]">{t("highTimeframe")} ({timeframe})</span>
          <span className="text-base font-bold text-emerald-400 font-mono">
            ${maxPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block text-[11px]">{t("lowTimeframe")} ({timeframe})</span>
          <span className="text-base font-bold text-rose-400 font-mono">
            ${minPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block text-[11px]">{t("activeAlertsHeader")}</span>
          <span className="text-base font-bold text-amber-400 font-mono flex items-center gap-1">
            {tokenAlerts.length}
            {tokenAlerts.length > 0 && (
              <span className="text-[10px] font-normal text-slate-400">
                ({tokenAlerts.map((a) => `${a.condition === "ABOVE" ? ">" : "<"}$${a.targetPrice}`).join(", ")})
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Recharts Area Container */}
      <div className="h-[280px] sm:h-[340px] w-full mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

            <XAxis
              dataKey="time"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#334155" }}
              dy={5}
            />

            <YAxis
              domain={[yDomainMin, yDomainMax]}
              stroke="#64748b"
              fontSize={11}
              orientation="right"
              tickLine={false}
              axisLine={{ stroke: "#334155" }}
              tickFormatter={(val) =>
                val >= 1000
                  ? `$${val.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                  : `$${val.toFixed(basePricePrecision(val))}`
              }
              dx={5}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 shadow-xl text-xs font-mono">
                      <div className="text-slate-400 text-[10px] mb-1">{data.time}</div>
                      <div className="text-cyan-400 font-bold text-sm">
                        ${data.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Render Threshold Alert Reference Lines */}
            {tokenAlerts.map((alert) => (
              <ReferenceLine
                key={alert.id}
                y={alert.targetPrice}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `${t("alert")}: ${alert.condition === "ABOVE" ? "≥" : "≤"} $${alert.targetPrice}`,
                  fill: "#fbbf24",
                  fontSize: 10,
                  position: "insideTopRight",
                }}
              />
            ))}

            <Area
              type="monotone"
              dataKey="price"
              stroke="#06b6d4"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#tokenGradient)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          {t("dexRouteSource")}
        </span>
        <span className="font-mono">
          Mint: {token.mint.slice(0, 8)}...{token.mint.slice(-6)}
        </span>
      </div>
    </div>
  );
};
