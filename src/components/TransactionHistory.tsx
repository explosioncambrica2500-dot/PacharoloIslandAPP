import React, { useState } from "react";
import {
  Download,
  ExternalLink,
  Search,
  ArrowRightLeft,
  RefreshCw,
  Bot,
  ShoppingCart,
  Sparkles,
  ArrowRight,
  TrendingDown,
  ShieldCheck,
} from "lucide-react";
import { DexTransaction, CryptoSymbol, TokenPriceData } from "../types";
import { exportTransactionsToCSV } from "../utils/csv";

interface TransactionHistoryProps {
  transactions: DexTransaction[];
  tokens: Record<CryptoSymbol, TokenPriceData>;
  onAddTransaction?: (tx: {
    symbol: CryptoSymbol;
    type: "BUY" | "SELL";
    amount: number;
    priceUsd: number;
  }) => void;
  isLoading: boolean;
  onRefreshTransactions: () => void;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  transactions,
  tokens,
  isLoading,
  onRefreshTransactions,
}) => {
  const [filterSymbol, setFilterSymbol] = useState<string>("ALL");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Only display transactions executed by the bot (INITIAL_BUY, ROTATION_SWAP, or bot BUY)
  const filteredTransactions = transactions.filter((tx) => {
    // Filter token (either symbol or target symbol)
    if (filterSymbol !== "ALL") {
      if (tx.symbol !== filterSymbol && tx.toSymbol !== filterSymbol) return false;
    }

    // Filter type
    if (filterType !== "ALL") {
      if (filterType === "INITIAL_BUY") {
        if (tx.type !== "INITIAL_BUY" && tx.type !== "BUY") return false;
      } else if (filterType === "ROTATION_SWAP") {
        if (tx.type !== "ROTATION_SWAP") return false;
      }
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        tx.symbol.toLowerCase().includes(q) ||
        (tx.toSymbol && tx.toSymbol.toLowerCase().includes(q)) ||
        tx.txHash.toLowerCase().includes(q) ||
        tx.wallet.toLowerCase().includes(q) ||
        tx.dex.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleExport = () => {
    exportTransactionsToCSV(
      filteredTransactions.length > 0 ? filteredTransactions : transactions,
      `jupiter_operaciones_bot_${filterSymbol.toLowerCase()}`
    );
  };

  const scrollToStrategy = () => {
    const el = document.getElementById("rotation-strategy-panel");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 lg:p-5 backdrop-blur-sm flex flex-col gap-4">
      {/* Top Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Historial de Operaciones del Bot
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/40 font-semibold uppercase">
                  Solo Órdenes del Bot
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {filteredTransactions.length} registros
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Registro exclusivo de compras iniciales y swaps automáticos ejecutados por el bot cuantitativo en Jupiter DEX
              </p>
            </div>
          </div>
        </div>

        {/* Actions: Export CSV & Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="export-csv-button"
            onClick={handleExport}
            disabled={transactions.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md shadow-emerald-950/40 transition-colors"
            title="Exportar operaciones del bot a archivo CSV para Excel/Sheets"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV del Bot</span>
          </button>

          <button
            onClick={onRefreshTransactions}
            disabled={isLoading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50 transition-colors"
            title="Actualizar registro del bot"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 text-xs">
        {/* Token Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 text-[11px] font-medium">Token:</span>
          <select
            id="token-filter-select"
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-cyan-500 flex-1"
          >
            <option value="ALL">Todos los Tokens</option>
            <option value="SOL">SOL (Solana)</option>
            <option value="BTC">BTC (Bitcoin)</option>
            <option value="ETH">ETH (Ethereum)</option>
            <option value="ZEC">ZEC (Zcash)</option>
            <option value="HYPE">HYPE (Hyperliquid)</option>
          </select>
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 text-[11px] font-medium">Tipo de Orden:</span>
          <select
            id="type-filter-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-cyan-500 flex-1"
          >
            <option value="ALL">Todas las Operaciones del Bot</option>
            <option value="INITIAL_BUY">Compras Iniciales (Descuento / Más Barata)</option>
            <option value="ROTATION_SWAP">Swaps de Rotación (Arbitraje)</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar token, wallet o hash..."
            className="w-full bg-slate-900 border border-slate-700 rounded pl-8 pr-2 py-1 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Transactions Table Container */}
      {transactions.length === 0 ? (
        <div className="p-8 border border-dashed border-slate-800 rounded-xl bg-slate-950/40 text-center flex flex-col items-center justify-center gap-3">
          <div className="p-3 rounded-full bg-slate-800/80 border border-slate-700 text-cyan-400">
            <Bot className="w-8 h-8 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white mb-1">
              El bot aún no ha ejecutado transacciones
            </h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Para ver registros aquí, haz clic en <span className="text-emerald-400 font-semibold">"Compra Inicial"</span> en la estrategia o activa el interruptor <span className="text-cyan-400 font-semibold">"Bot Auto-Swap"</span>. Solo se mostrarán las operaciones ejecutadas por el bot.
            </p>
          </div>
          <button
            onClick={scrollToStrategy}
            className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors shadow-lg shadow-cyan-950/50"
          >
            <span>Ir a la Estrategia del Bot</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-xs bg-slate-950/40 rounded-lg border border-slate-800">
          No hay operaciones del bot que coincidan con los filtros seleccionados.
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
                <th className="py-2.5 px-3">Fecha y Hora</th>
                <th className="py-2.5 px-3">Par / Ruta</th>
                <th className="py-2.5 px-3">Tipo de Operación</th>
                <th className="py-2.5 px-3 text-right">Precio Ref.</th>
                <th className="py-2.5 px-3 text-right">Cantidad Origen</th>
                <th className="py-2.5 px-3 text-right">Cantidad Destino</th>
                <th className="py-2.5 px-3 text-right">Total USD</th>
                <th className="py-2.5 px-3">Billetera / DEX</th>
                <th className="py-2.5 px-3 text-center">Tx Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredTransactions.map((tx) => {
                const isInitialBuy = tx.type === "INITIAL_BUY" || tx.type === "BUY";
                const isSwap = tx.type === "ROTATION_SWAP";

                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-800/40 transition-colors text-slate-300"
                  >
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-400 font-sans text-[11px]">
                      {new Date(tx.timestamp).toLocaleTimeString("es-ES", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-white">
                      {isSwap && tx.toSymbol ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-slate-200">{tx.symbol}</span>
                          <span className="text-cyan-400 text-xs">➔</span>
                          <span className="text-emerald-400">{tx.toSymbol}</span>
                        </span>
                      ) : (
                        <span className="text-emerald-400">{tx.symbol}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {isSwap ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/70 text-purple-300 border border-purple-800/50">
                            <ArrowRightLeft className="w-3 h-3 text-cyan-400" />
                            SWAP ROTATIVO
                          </span>
                          {tx.spreadPercent !== undefined && (
                            <span className="text-[10px] font-bold text-yellow-400 bg-yellow-950/50 border border-yellow-800/40 px-1.5 py-0.2 rounded">
                              +{tx.spreadPercent.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-800/50">
                          <ShoppingCart className="w-3 h-3 text-emerald-400" />
                          COMPRA INICIAL
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      ${tx.priceUsd.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: tx.priceUsd > 100 ? 2 : 4,
                      })}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300 font-semibold">
                      {tx.amount} {tx.symbol}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-300 font-semibold">
                      {isSwap && tx.toAmount && tx.toSymbol ? (
                        `${tx.toAmount} ${tx.toSymbol}`
                      ) : (
                        <span className="text-slate-600 font-sans">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">
                      ${tx.totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px] font-sans">
                      <span className="text-slate-200 block font-medium">{tx.wallet}</span>
                      <span className="text-slate-500 block text-[10px]">{tx.dex}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <a
                        href={`https://solscan.io/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 underline font-mono"
                        title="Ver en Solscan"
                      >
                        <span>{tx.txHash.slice(0, 4)}...{tx.txHash.slice(-3)}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
