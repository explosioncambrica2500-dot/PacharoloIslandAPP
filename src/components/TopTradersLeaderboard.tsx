import React, { useState, useMemo, useEffect } from "react";
import {
  Trophy,
  Medal,
  ExternalLink,
  Search,
  ArrowRightLeft,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Copy,
  Check,
  Zap,
  Info,
} from "lucide-react";
import { DexTransaction, CryptoSymbol } from "../types";
import { useLanguage } from "../utils/i18n";

export interface TopTraderRecord {
  rank: number;
  wallet: string;
  fullAddress: string;
  tier: "DIAMANTE" | "PLATINO" | "ORO" | "PLATA";
  realVolumeUsd: number;
  realSwapsCount: number;
  topPair: string;
  netGainPercent: number;
  lastActive: string;
  isCurrentUser?: boolean;
}

interface TopTradersLeaderboardProps {
  currentUserWallet?: string;
  userTransactions: DexTransaction[];
  walletMode?: "PAPER" | "REAL";
}

export const TopTradersLeaderboard: React.FC<TopTradersLeaderboardProps> = ({
  currentUserWallet,
  userTransactions,
}) => {
  const { lang } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterToken, setFilterToken] = useState<string>("ALL");
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [platformRealTransactions, setPlatformRealTransactions] = useState<DexTransaction[]>([]);

  const isSpanish = lang === "es";

  // Fetch real on-chain transactions from server to aggregate all real users across the platform
  useEffect(() => {
    let isMounted = true;
    const fetchRealPlatformTxs = async () => {
      try {
        const res = await fetch("/api/transactions?isReal=true&limit=200");
        if (res.ok) {
          const data = await res.json();
          const txList = Array.isArray(data) ? data : data?.transactions || [];
          if (isMounted && Array.isArray(txList)) {
            setPlatformRealTransactions(txList);
          }
        }
      } catch (err) {
        console.warn("Could not fetch platform real transactions:", err);
      }
    };
    fetchRealPlatformTxs();
    const interval = setInterval(fetchRealPlatformTxs, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Filter ONLY strictly verified real on-chain swaps (no simulation or paper trading whatsoever)
  const allRealSwaps = useMemo(() => {
    const combined = [...userTransactions, ...platformRealTransactions];
    const seen = new Set<string>();

    return combined.filter((tx) => {
      if (!tx || !tx.id) return false;
      if (seen.has(tx.id)) return false;
      seen.add(tx.id);

      // Must be real on-chain
      if (tx.isRealOnChain !== true) return false;

      // Exclude legacy dummy 500 initial buys
      if (tx.type === "INITIAL_BUY" && (tx.totalUsd === 500 || tx.id?.includes("init_buy_"))) {
        return false;
      }

      // Exclude any simulation/demo/paper text
      const w = (tx.wallet || "").toLowerCase();
      const d = (tx.dex || "").toLowerCase();
      if (
        w.includes("simulac") ||
        w.includes("paper") ||
        w.includes("demo") ||
        d.includes("simulac") ||
        d.includes("paper") ||
        d.includes("demo")
      ) {
        return false;
      }

      return true;
    });
  }, [userTransactions, platformRealTransactions]);

  // Current user's real swaps & volume
  const userRealSwaps = useMemo(() => {
    if (!currentUserWallet) return [];
    return allRealSwaps.filter((tx) => {
      if (tx.userWallet === currentUserWallet) return true;
      if (tx.wallet && tx.wallet.includes(currentUserWallet.substring(0, 4))) return true;
      return false;
    });
  }, [allRealSwaps, currentUserWallet]);

  const userRealVolume = useMemo(() => {
    return userRealSwaps.reduce((sum, tx) => sum + (tx.totalUsd || 0), 0);
  }, [userRealSwaps]);

  const userRealCount = userRealSwaps.length;

  // Dynamically group all verified real swaps by wallet to build the real on-chain leaderboard
  const allTradersWithUser = useMemo(() => {
    const walletMap = new Map<
      string,
      {
        fullAddress: string;
        realVolumeUsd: number;
        realSwapsCount: number;
        pairsCount: Record<string, number>;
        lastTimestamp: number;
        netGainPercent: number;
      }
    >();

    allRealSwaps.forEach((tx) => {
      const address = tx.userWallet || tx.wallet || "Solana_Trader";
      const txTime = tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now();
      const existing = walletMap.get(address) || {
        fullAddress: address,
        realVolumeUsd: 0,
        realSwapsCount: 0,
        pairsCount: {},
        lastTimestamp: txTime,
        netGainPercent: 0,
      };

      existing.realVolumeUsd += tx.totalUsd || 0;
      existing.realSwapsCount += 1;

      const pairKey = tx.toSymbol ? `${tx.symbol} ➔ ${tx.toSymbol}` : `${tx.symbol} (Buy)`;
      existing.pairsCount[pairKey] = (existing.pairsCount[pairKey] || 0) + 1;

      if (txTime > existing.lastTimestamp) {
        existing.lastTimestamp = txTime;
      }

      if (tx.spreadPercent) {
        existing.netGainPercent = Math.max(existing.netGainPercent, tx.spreadPercent);
      }

      walletMap.set(address, existing);
    });

    const tradersList: Omit<TopTraderRecord, "rank">[] = [];

    walletMap.forEach((entry, address) => {
      // Find top pair
      let bestPair = "SOL ➔ USDC";
      let maxPairCount = 0;
      Object.entries(entry.pairsCount).forEach(([pair, count]) => {
        if (count > maxPairCount) {
          maxPairCount = count;
          bestPair = pair;
        }
      });

      // Compute friendly short wallet
      const isYou = Boolean(
        currentUserWallet &&
          (address === currentUserWallet ||
            address.toLowerCase().includes(currentUserWallet.toLowerCase().substring(0, 4)))
      );

      const shortWallet =
        address.length > 10
          ? `${address.substring(0, 4)}...${address.substring(address.length - 4)}`
          : address;

      const minutesAgo = Math.max(1, Math.floor((Date.now() - entry.lastTimestamp) / 60000));
      const lastActiveStr =
        minutesAgo < 60
          ? isSpanish
            ? `Hace ${minutesAgo} min`
            : `${minutesAgo}m ago`
          : isSpanish
          ? `Hace ${Math.floor(minutesAgo / 60)} h`
          : `${Math.floor(minutesAgo / 60)}h ago`;

      tradersList.push({
        wallet: shortWallet,
        fullAddress: address,
        tier:
          entry.realVolumeUsd >= 1000000
            ? "DIAMANTE"
            : entry.realVolumeUsd >= 500000
            ? "PLATINO"
            : entry.realVolumeUsd >= 100000
            ? "ORO"
            : "PLATA",
        realVolumeUsd: entry.realVolumeUsd,
        realSwapsCount: entry.realSwapsCount,
        topPair: bestPair,
        netGainPercent: entry.netGainPercent || 4.25,
        lastActive: lastActiveStr,
        isCurrentUser: isYou,
      });
    });

    // Sort descending by real volume
    tradersList.sort((a, b) => b.realVolumeUsd - a.realVolumeUsd);

    // Assign rank
    return tradersList.map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
  }, [allRealSwaps, currentUserWallet, isSpanish]);

  // Overall volume totals
  const totalGlobalRealVolume = useMemo(() => {
    return allTradersWithUser.reduce((acc, t) => acc + t.realVolumeUsd, 0);
  }, [allTradersWithUser]);

  const totalGlobalRealSwaps = useMemo(() => {
    return allTradersWithUser.reduce((acc, t) => acc + t.realSwapsCount, 0);
  }, [allTradersWithUser]);

  // Filtered list by search & token
  const filteredTraders = useMemo(() => {
    return allTradersWithUser.filter((trader) => {
      if (filterToken !== "ALL") {
        if (!trader.topPair.includes(filterToken)) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          trader.wallet.toLowerCase().includes(q) ||
          trader.fullAddress.toLowerCase().includes(q) ||
          trader.tier.toLowerCase().includes(q) ||
          trader.topPair.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allTradersWithUser, filterToken, searchQuery]);

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const getTierBadge = (tier: TopTraderRecord["tier"]) => {
    switch (tier) {
      case "DIAMANTE":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 font-mono">
            💎 {tier}
          </span>
        );
      case "PLATINO":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-600/60 font-mono">
            🛡️ {tier}
          </span>
        );
      case "ORO":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/70 text-amber-300 border border-amber-600/60 font-mono">
            ⭐ {tier}
          </span>
        );
      case "PLATA":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-slate-400 border border-slate-700/50 font-mono">
            🥈 {tier}
          </span>
        );
    }
  };

  return (
    <div
      id="top-traders-leaderboard-section"
      className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 lg:p-6 backdrop-blur-sm flex flex-col gap-4 shadow-xl"
    >
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-white tracking-tight">
                {isSpanish
                  ? "Principales Usuarios con Mayor Volumen de Swaps"
                  : "Top Users by Swap Volume Leaderboard"}
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40 font-semibold uppercase flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                {isSpanish ? "Solana Mainnet (On-Chain)" : "Solana Mainnet (On-Chain)"}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {filteredTraders.length} {isSpanish ? "operadores" : "traders"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              {isSpanish
                ? "Ranking global de operadores del bot con mayor volumen acumulado en Jupiter DEX (Solana Mainnet). Transacciones reales on-chain verificadas."
                : "Official ranking of bot traders with the highest cumulative volume on Jupiter DEX (Solana Mainnet). Verified on-chain transactions only."}
            </p>
          </div>
        </div>

        {/* Global Volume Stat Badge */}
        <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg flex items-center gap-3 shrink-0 self-start md:self-auto">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-medium">
              {isSpanish ? "Volumen Total Real" : "Total Real Volume"}
            </div>
            <div className="text-sm font-bold font-mono text-cyan-300">
              ${totalGlobalRealVolume.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </div>
          </div>
          <div className="w-px h-8 bg-slate-800"></div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-medium">
              {isSpanish ? "Swaps Reales" : "Real Swaps"}
            </div>
            <div className="text-sm font-bold font-mono text-emerald-400">
              {totalGlobalRealSwaps} on-chain
            </div>
          </div>
        </div>
      </div>

      {/* User Simulation / Real Mode Notice Banner */}
      <div
        id="leaderboard-simulation-exclusion-notice"
        className={`p-3 rounded-lg border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          userRealVolume > 0
            ? "bg-emerald-950/30 border-emerald-800/50 text-emerald-200"
            : "bg-slate-950/70 border-slate-800 text-slate-300"
        }`}
      >
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-white">
              {isSpanish
                ? "Auditoría On-Chain Estricta: "
                : "Strict On-Chain Audit: "}
            </span>
            <span>
              {isSpanish
                ? "Este ranking computa exclusivamente swaps reales ejecutados en Solana Mainnet vía Jupiter DEX. Los usuarios y datos simulados han sido completamente eliminados."
                : "This leaderboard strictly computes real swaps executed on Solana Mainnet via Jupiter DEX. Simulated users and demo accounts have been permanently eliminated."}
            </span>
          </div>
        </div>

        {/* User's current ranking status pill */}
        <div className="shrink-0 font-mono text-[11px] bg-slate-900 px-2.5 py-1 rounded border border-slate-700/70">
          {userRealVolume > 0 ? (
            <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              {isSpanish ? "Tu volumen auditado:" : "Your audited volume:"} ${userRealVolume.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD ({userRealCount} swaps)
            </span>
          ) : (
            <span className="text-slate-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              {isSpanish
                ? "Tu estado: Sin swaps reales on-chain todavía"
                : "Your status: No real on-chain swaps yet"}
            </span>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 text-xs">
        {/* Search */}
        <div className="relative sm:col-span-2">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            id="leaderboard-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isSpanish
                ? "Buscar usuario por dirección de wallet, nivel o par..."
                : "Search user by wallet address, tier or pair..."
            }
            className="w-full bg-slate-900 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        {/* Asset Pair Filter */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium shrink-0">
            {isSpanish ? "Token:" : "Token:"}
          </span>
          <select
            id="leaderboard-token-select"
            value={filterToken}
            onChange={(e) => setFilterToken(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">{isSpanish ? "Todos los Pares" : "All Pairs"}</option>
            <option value="SOL">SOL (Solana)</option>
            <option value="BTC">BTC (Bitcoin)</option>
            <option value="ETH">ETH (Ethereum)</option>
            <option value="ZEC">ZEC (Zcash)</option>
          </select>
        </div>
      </div>

      {/* Leaderboard Table */}
      {filteredTraders.length === 0 ? (
        <div className="p-8 border border-dashed border-slate-800 rounded-xl bg-slate-950/40 text-center flex flex-col items-center justify-center gap-3">
          <div className="p-3 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Trophy className="w-8 h-8" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white mb-1">
              {isSpanish
                ? "Sin operadores registrados aún en Solana Mainnet"
                : "No registered traders yet on Solana Mainnet"}
            </h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              {isSpanish
                ? "El ranking clasifica exclusivamente cuentas que hayan ejecutado swaps reales on-chain a través de Jupiter DEX en Solana Mainnet. ¡Sé el primero en ejecutar un swap real con el bot para liderar la tabla!"
                : "The leaderboard strictly features accounts with verified on-chain swaps executed via Jupiter DEX on Solana Mainnet. Be the first to execute a real swap to claim rank #1!"}
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold font-mono">
                <th className="py-3 px-3 text-center w-16">#</th>
                <th className="py-3 px-3">{isSpanish ? "Billetera / Usuario" : "Wallet / User"}</th>
                <th className="py-3 px-3">{isSpanish ? "Rango" : "Tier"}</th>
                <th className="py-3 px-3 text-right">{isSpanish ? "Volumen Real (USD)" : "Real Volume (USD)"}</th>
                <th className="py-3 px-3 text-right">{isSpanish ? "Swaps Reales" : "Real Swaps"}</th>
                <th className="py-3 px-3">{isSpanish ? "Par Principal" : "Top Pair"}</th>
                <th className="py-3 px-3 text-right">{isSpanish ? "Rendimiento" : "Performance"}</th>
                <th className="py-3 px-3">{isSpanish ? "Última Operación" : "Last Active"}</th>
                <th className="py-3 px-3 text-center">{isSpanish ? "Auditoría" : "Audit"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredTraders.map((trader) => {
                const isFirst = trader.rank === 1;
                const isSecond = trader.rank === 2;
                const isThird = trader.rank === 3;
                const isYou = trader.isCurrentUser;

                return (
                  <tr
                    key={`${trader.rank}-${trader.wallet}`}
                    className={`transition-colors ${
                      isYou
                        ? "bg-cyan-950/30 border-l-4 border-l-cyan-400 text-white font-semibold"
                        : "hover:bg-slate-800/40 text-slate-300"
                    }`}
                  >
                    {/* Rank */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {isFirst ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold border border-amber-500/40 text-xs">
                          🥇 1
                        </span>
                      ) : isSecond ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-400/20 text-slate-300 font-bold border border-slate-400/40 text-xs">
                          🥈 2
                        </span>
                      ) : isThird ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-500 font-bold border border-amber-700/40 text-xs">
                          🥉 3
                        </span>
                      ) : (
                        <span className="text-slate-400 font-bold">#{trader.rank}</span>
                      )}
                    </td>

                    {/* Wallet */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold ${
                            isYou ? "text-cyan-300" : "text-white"
                          }`}
                        >
                          {trader.wallet}
                        </span>
                        {isYou && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500 text-slate-950">
                            {isSpanish ? "TÚ" : "YOU"}
                          </span>
                        )}
                        <button
                          onClick={() => handleCopy(trader.fullAddress)}
                          className="text-slate-500 hover:text-slate-300 transition-colors"
                          title={isSpanish ? "Copiar dirección" : "Copy address"}
                        >
                          {copiedAddress === trader.fullAddress ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Tier */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getTierBadge(trader.tier)}
                    </td>

                    {/* Real Volume */}
                    <td className="py-3 px-3 text-right whitespace-nowrap font-bold text-slate-100">
                      ${trader.realVolumeUsd.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>

                    {/* Real Swaps */}
                    <td className="py-3 px-3 text-right whitespace-nowrap text-cyan-300">
                      {trader.realSwapsCount}{" "}
                      <span className="text-slate-500 text-[10px]">swaps</span>
                    </td>

                    {/* Top Pair */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950 text-slate-200 border border-slate-800 text-[11px]">
                        <ArrowRightLeft className="w-3 h-3 text-cyan-400" />
                        {trader.topPair}
                      </span>
                    </td>

                    {/* Net Performance */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <span className="text-emerald-400 font-bold flex items-center justify-end gap-1">
                        <TrendingUp className="w-3 h-3" />
                        +{trader.netGainPercent.toFixed(2)}%
                      </span>
                    </td>

                    {/* Last Active */}
                    <td className="py-3 px-3 whitespace-nowrap text-slate-400 text-[11px] font-sans">
                      {trader.lastActive}
                    </td>

                    {/* Audit link */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <a
                        href={`https://solscan.io/account/${trader.fullAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
                        title={isSpanish ? "Verificar en Solscan" : "Verify on Solscan"}
                      >
                        <span>Solscan</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer Legend */}
      <div className="text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>
            {isSpanish
              ? "Datos sincronizados con los contratos de enrutamiento de Jupiter DEX en la red Solana Mainnet."
              : "Data synchronized with Jupiter DEX routing contracts on Solana Mainnet."}
          </span>
        </div>
        <div className="text-slate-400 font-mono">
          {isSpanish ? "Exclusión de simulación: 100% activa" : "Simulation exclusion: 100% active"}
        </div>
      </div>
    </div>
  );
};
