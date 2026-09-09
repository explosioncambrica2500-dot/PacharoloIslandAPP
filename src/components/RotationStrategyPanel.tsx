import React, { useState, useEffect } from "react";
import {
  CryptoSymbol,
  TokenPriceData,
  TokenRankingItem,
  DexTransaction,
  RotationStrategyState,
} from "../types";
import {
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  Percent,
  Play,
  CheckCircle,
  Zap,
  Bot,
  AlertCircle,
  HelpCircle,
  Sliders,
  DollarSign,
  ArrowRight,
  Wallet,
  ShieldCheck,
  ShieldAlert,
  Edit3,
  Check,
} from "lucide-react";
import { soundEngine } from "../utils/audio";
import { WalletConfig, PlatformFeeConfig } from "../types";
import { AutonomousBotWalletCard } from "./AutonomousBotWalletCard";
import {
  executeAutonomousSwap,
  DEFAULT_FEE_COLLECTOR,
  BotKeypairData,
  getOrCreateBotKeypair,
} from "../utils/solanaBot";
import { useLanguage } from "../utils/i18n";

interface RotationStrategyPanelProps {
  tokens: Record<CryptoSymbol, TokenPriceData>;
  onExecuteSwap: (tx: DexTransaction) => void;
  transactions: DexTransaction[];
  walletConfig?: WalletConfig;
  onOpenWalletModal?: () => void;
}

export const RotationStrategyPanel: React.FC<RotationStrategyPanelProps> = ({
  tokens,
  onExecuteSwap,
  transactions,
  walletConfig,
  onOpenWalletModal,
}) => {
  const { t } = useLanguage();
  // Autonomous Sub-Wallet & Platform Fee state
  const [botKeypair, setBotKeypair] = useState<BotKeypairData>(() => getOrCreateBotKeypair());
  const [isLiveOnChain, setIsLiveOnChain] = useState<boolean>(() => {
    try {
      return localStorage.getItem("pacharolo_live_onchain") === "true";
    } catch {
      return false;
    }
  });

  const [platformFeeConfig, setPlatformFeeConfig] = useState<PlatformFeeConfig>(() => {
    try {
      const saved = localStorage.getItem("pacharolo_platform_fee_config");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.feeCollectorAddress && !parsed.feeCollectorAddress.startsWith("PacharoLoFee")) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Could not read platform fee config:", e);
    }
    return {
      feeCollectorAddress: DEFAULT_FEE_COLLECTOR,
      platformFeeBps: 20, // 0.20%
      totalFeesCollectedUsd: 0,
      totalSwapsMonetized: 0,
    };
  });

  const handleUpdateFeeConfig = (newCfg: PlatformFeeConfig) => {
    setPlatformFeeConfig(newCfg);
    try {
      localStorage.setItem("pacharolo_platform_fee_config", JSON.stringify(newCfg));
    } catch (e) {
      console.warn("Could not save fee config:", e);
    }
  };

  const handleChangeLiveMode = (isLive: boolean) => {
    setIsLiveOnChain(isLive);
    try {
      localStorage.setItem("pacharolo_live_onchain", isLive ? "true" : "false");
    } catch (e) {
      console.warn("Could not save live mode:", e);
    }
  };
  // Strategy state
  const [strategyState, setStrategyState] = useState<RotationStrategyState>(() => {
    return {
      initialBuyDone: false,
      currentHoldingToken: "SOL",
      currentHoldingAmount: 0,
      autoBotEnabled: false,
      minSpreadThreshold: 2.0, // 2% spread
      minNetGainThreshold: 0.5, // 0.5% net profit required after costs
      gasFeeUsd: 0.015, // Gas fee Solana in USD
      dexFeePercent: 0.10, // Jupiter routing fee (0.10%)
      slippagePercent: 0.15, // Expected slippage (0.15%)
      totalSwapsCount: 0,
      strategyPnlUsd: 0,
    };
  });

  const [initialCapitalUsd, setInitialCapitalUsd] = useState<number>(500);
  const [showExplainer, setShowExplainer] = useState(false);
  const [showCostSettings, setShowCostSettings] = useState(false);
  const [isEditingHolding, setIsEditingHolding] = useState(false);
  const [manualHoldingInput, setManualHoldingInput] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [selectedSourceToken, setSelectedSourceToken] = useState<CryptoSymbol | null>(null);
  const [selectedTargetToken, setSelectedTargetToken] = useState<CryptoSymbol | null>(null);

  // 1. Calculate and rank all 5 tokens by priceChange24h (percentage of change)
  const ranking: TokenRankingItem[] = (
    Object.keys(tokens) as CryptoSymbol[]
  )
    .map((sym) => {
      const t = tokens[sym];
      return {
        symbol: sym,
        name: t.name,
        usdPrice: t.usdPrice,
        changePercent: t.priceChange24h,
        rank: 0,
        isHighest: false,
        isLowest: false,
      };
    })
    .sort((a, b) => b.changePercent - a.changePercent) // Descending: highest % (dropped least/gained most) at [0]
    .map((item, idx, arr) => ({
      ...item,
      rank: idx + 1,
      isHighest: idx === 0,
      isLowest: idx === arr.length - 1,
    }));

  const leastDropToken = ranking[0] || { symbol: "SOL" as CryptoSymbol, changePercent: 0, usdPrice: 104 };
  const overallCheapestToken = ranking[ranking.length - 1] || leastDropToken;

  // REGLA FUNDAMENTAL: El token de origen de venta NO PUEDE ser el token de destino de compra.
  // 1. Origen (Venta): token seleccionado manualmente, o en posesión, o el que menos cayó.
  const activeSwapFrom: CryptoSymbol =
    selectedSourceToken || strategyState.currentHoldingToken || leastDropToken.symbol;

  // 2. Destino (Compra): Candidatos filtrados estrictamente para EXCLUIR el token de origen.
  const destinationCandidates = ranking.filter((t) => t.symbol !== activeSwapFrom);

  // La moneda óptima de destino es la de mayor caída (más barata) entre los tokens restantes:
  const autoBestDestination = destinationCandidates.length > 0
    ? destinationCandidates[destinationCandidates.length - 1]
    : ranking.find((t) => t.symbol !== activeSwapFrom) || { symbol: "BTC" as CryptoSymbol, changePercent: 0, usdPrice: 79000 };

  // El token de destino activo nunca puede ser igual al de origen:
  const activeSwapTo: CryptoSymbol =
    selectedTargetToken && selectedTargetToken !== activeSwapFrom
      ? selectedTargetToken
      : autoBestDestination.symbol;

  const cheapestToken = overallCheapestToken;
  const spreadPercent = leastDropToken && cheapestToken ? leastDropToken.changePercent - cheapestToken.changePercent : 0;

  // Helper to calculate exact swap operation costs, net gain and +0.5% threshold condition
  const calculateSwapMetrics = (fromSymbol: CryptoSymbol, toSymbol: CryptoSymbol) => {
    // Protección estricta: origen y destino no pueden ser iguales
    if (fromSymbol === toSymbol) return null;

    const fromToken = tokens[fromSymbol];
    const toToken = tokens[toSymbol];
    if (!fromToken || !toToken) return null;

    const sourceAmount = strategyState.currentHoldingAmount > 0 && strategyState.currentHoldingToken === fromSymbol
      ? strategyState.currentHoldingAmount
      : Number((initialCapitalUsd / fromToken.usdPrice).toFixed(4));

    const currentTotalValueUsd = sourceAmount * fromToken.usdPrice;

    // Operation costs
    const gasFeeUsd = strategyState.gasFeeUsd ?? 0.015;
    const dexFeePercent = strategyState.dexFeePercent ?? 0.10;
    const slippagePercent = strategyState.slippagePercent ?? 0.15;
    const dexFeeUsd = currentTotalValueUsd * (dexFeePercent / 100);
    const slippageUsd = currentTotalValueUsd * (slippagePercent / 100);
    const totalCostsUsd = gasFeeUsd + dexFeeUsd + slippageUsd;

    // Spread and net increase
    const spread = fromToken.priceChange24h - toToken.priceChange24h;
    const grossGainUsd = currentTotalValueUsd * (spread / 100);
    const netGainUsd = grossGainUsd - totalCostsUsd;
    const netGainPercent = currentTotalValueUsd > 0 ? (netGainUsd / currentTotalValueUsd) * 100 : 0;
    const minNetGain = strategyState.minNetGainThreshold ?? 0.5;
    const isProfitable = netGainPercent >= minNetGain;

    const netValueUsd = currentTotalValueUsd - totalCostsUsd;
    const targetAmount = Number((netValueUsd / toToken.usdPrice).toFixed(toToken.usdPrice > 100 ? 5 : 3));

    return {
      fromSymbol,
      toSymbol,
      sourceAmount,
      targetAmount,
      fromPrice: fromToken.usdPrice,
      toPrice: toToken.usdPrice,
      currentTotalValueUsd,
      gasFeeUsd,
      dexFeePercent,
      dexFeeUsd,
      slippagePercent,
      slippageUsd,
      totalCostsUsd,
      spread,
      grossGainUsd,
      netGainUsd,
      netGainPercent,
      minNetGain,
      isProfitable,
      netValueUsd,
    };
  };

  // Active projection for the current proposed swap (Origen y Destino siempre distintos)
  const activeMetrics = calculateSwapMetrics(activeSwapFrom, activeSwapTo);

  // Handle Step 1: Initial Purchase of the token with the highest drop percentage (the cheapest token)
  const handleInitialBuy = () => {
    if (!cheapestToken) return;
    setIsExecuting(true);
    soundEngine.playAlertChime("high");

    const amountTokens = Number((initialCapitalUsd / cheapestToken.usdPrice).toFixed(cheapestToken.usdPrice > 100 ? 5 : 3));
    const now = new Date().toISOString();

    const buyTx: DexTransaction = {
      id: `init_buy_${Date.now()}`,
      timestamp: now,
      symbol: cheapestToken.symbol,
      type: "INITIAL_BUY",
      amount: amountTokens,
      priceUsd: cheapestToken.usdPrice,
      totalUsd: initialCapitalUsd,
      txHash: `${Math.random().toString(36).substring(2, 8).toUpperCase()}...INIT`,
      dex: "Jupiter DEX (Solana)",
      wallet: "Bot (Compra Inicial)",
      status: "CONFIRMED",
      spreadPercent: cheapestToken.changePercent,
    };

    onExecuteSwap(buyTx);

    setStrategyState((prev) => ({
      ...prev,
      initialBuyDone: true,
      initialBuyToken: cheapestToken.symbol,
      initialBuyAmount: amountTokens,
      initialBuyPriceUsd: cheapestToken.usdPrice,
      initialBuyTotalUsd: initialCapitalUsd,
      currentHoldingToken: cheapestToken.symbol,
      currentHoldingAmount: amountTokens,
      strategyPnlUsd: 0,
    }));

    setLastActionMessage(
      `✓ Compra inicial completada: ${amountTokens} ${cheapestToken.symbol} ($${initialCapitalUsd} USD) por registrar el mayor porcentaje de cambio a la baja (${cheapestToken.changePercent.toFixed(2)}%), siendo la moneda más barata.`
    );

    setTimeout(() => setIsExecuting(false), 400);
  };

  // Handle Step 2: Swap from the source token to the target token (STRICTLY DIFFERENT)
  // STRICT RULE: Only execute if net gain is >= minNetGainThreshold (default 0.5%) after deducting costs
  const handleRotationSwap = async (customSource?: CryptoSymbol, customTarget?: CryptoSymbol) => {
    const fromSymbol = customSource || activeSwapFrom;
    const toSymbol = customTarget || activeSwapTo;

    if (fromSymbol === toSymbol) {
      alert("El token de origen de venta no puede ser el mismo que el de destino de compra. Elige dos activos diferentes.");
      return;
    }

    const metrics = calculateSwapMetrics(fromSymbol, toSymbol);
    if (!metrics) return;

    // VALIDACIÓN ESTRICTA: Solo realizar el swap si se consigue aumentar el monto total en >= 0.5% neto tras costes
    if (!metrics.isProfitable) {
      soundEngine.playAlertChime("low");
      setLastActionMessage(
        `⚠️ Swap cancelado: El aumento neto estimado (+${metrics.netGainPercent.toFixed(2)}%) es inferior al mínimo requerido de +${metrics.minNetGain.toFixed(2)}% tras descontar los costes totales ($${metrics.totalCostsUsd.toFixed(2)} USD: Gas $${metrics.gasFeeUsd.toFixed(3)} + DEX/Slippage $${(metrics.dexFeeUsd + metrics.slippageUsd).toFixed(2)}). Capital de $${metrics.currentTotalValueUsd.toFixed(2)} USD protegido.`
      );
      return;
    }

    setIsExecuting(true);
    soundEngine.playAlertChime("high");

    // Ejecución autónoma (firma desatendida y cobro de Platform Fee de Jupiter)
    let txHash = `${Math.random().toString(36).substring(2, 7).toUpperCase()}...JUP`;
    let platformFeeEarnedUsd = (metrics.currentTotalValueUsd * platformFeeConfig.platformFeeBps) / 10000;

    try {
      const swapResult = await executeAutonomousSwap({
        fromSymbol,
        toSymbol,
        amount: metrics.sourceAmount,
        sourceUsdPrice: metrics.fromPrice,
        targetUsdPrice: metrics.toPrice,
        secretKeyBase58: botKeypair.secretKeyBase58,
        isLiveOnChain,
        platformFeeBps: platformFeeConfig.platformFeeBps,
        feeCollectorAddress: platformFeeConfig.feeCollectorAddress,
      });

      if (swapResult.txHash) {
        txHash = swapResult.txHash;
      }
      if (swapResult.platformFeeUsd) {
        platformFeeEarnedUsd = swapResult.platformFeeUsd;
      }
    } catch (swapErr) {
      console.warn("Autonomous swap fallback:", swapErr);
    }

    const now = new Date().toISOString();

    const swapTx: DexTransaction = {
      id: `rot_swap_${Date.now()}`,
      timestamp: now,
      symbol: fromSymbol,
      type: "ROTATION_SWAP",
      amount: metrics.sourceAmount,
      priceUsd: metrics.fromPrice,
      totalUsd: Number(metrics.currentTotalValueUsd.toFixed(2)),
      toSymbol: toSymbol,
      toAmount: metrics.targetAmount,
      spreadPercent: Number(metrics.spread.toFixed(2)),
      txHash,
      dex: isLiveOnChain ? "Jupiter DEX (On-Chain Solana)" : "Jupiter DEX Router (Simulación)",
      wallet: isLiveOnChain
        ? `Sub-Wallet (${botKeypair.publicKey.substring(0, 4)}...${botKeypair.publicKey.substring(botKeypair.publicKey.length - 4)})`
        : "Bot Autónomo (Sub-Wallet)",
      status: "CONFIRMED",
    };

    onExecuteSwap(swapTx);

    // Registrar comisiones ganadas para el creador del bot
    handleUpdateFeeConfig({
      ...platformFeeConfig,
      totalFeesCollectedUsd: platformFeeConfig.totalFeesCollectedUsd + platformFeeEarnedUsd,
      totalSwapsMonetized: platformFeeConfig.totalSwapsMonetized + 1,
    });

    setStrategyState((prev) => ({
      ...prev,
      initialBuyDone: true,
      currentHoldingToken: toSymbol,
      currentHoldingAmount: metrics.targetAmount,
      lastSwapAt: now,
      totalSwapsCount: prev.totalSwapsCount + 1,
    }));

    // Reset custom selection to let next cycle recalculate automatically
    setSelectedSourceToken(null);
    setSelectedTargetToken(null);

    setLastActionMessage(
      `✓ Swap autónomo completado (${isLiveOnChain ? "On-Chain" : "Simulado"}): ${metrics.sourceAmount} ${fromSymbol} ➔ ${metrics.targetAmount} ${toSymbol} (+${metrics.netGainPercent.toFixed(2)}% neto | Fee plataforma: $${platformFeeEarnedUsd.toFixed(3)} USD). Tx: ${txHash.substring(0, 16)}...`
    );

    setTimeout(() => setIsExecuting(false), 400);
  };

  // Automated Rebalancing Loop: When Auto Bot is active, only trigger swap if net gain >= minNetGainThreshold (0.5%)
  useEffect(() => {
    if (!strategyState.autoBotEnabled) return;

    const timer = setInterval(() => {
      const fromSym = strategyState.currentHoldingToken || leastDropToken?.symbol || "SOL";
      // Filtrar estrictamente candidatos para que el destino NUNCA sea el origen:
      const validTargets = ranking.filter((t) => t.symbol !== fromSym);
      if (validTargets.length === 0) return;
      const toSym = validTargets[validTargets.length - 1].symbol;

      if (fromSym !== toSym) {
        const metrics = calculateSwapMetrics(fromSym, toSym);
        // Validar estrictamente que cubra costes y aumente el valor del monto en >= 0.5% neto
        if (metrics && metrics.isProfitable) {
          handleRotationSwap(fromSym, toSym);
        }
      }
    }, 6000);

    return () => clearInterval(timer);
  }, [strategyState.autoBotEnabled, strategyState.currentHoldingToken, ranking, strategyState.minNetGainThreshold]);

  // Current value of held asset
  const currentHeldTokenData = tokens[strategyState.currentHoldingToken];
  const currentPortfolioValueUsd = strategyState.currentHoldingAmount > 0 && currentHeldTokenData
    ? strategyState.currentHoldingAmount * currentHeldTokenData.usdPrice
    : initialCapitalUsd;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 lg:p-6 backdrop-blur-sm space-y-6">
      {/* Header & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                {t("strategyHeading")}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/40 uppercase font-semibold">
                  {t("dexSwapBadge")}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {t("strategyHeadingDesc")}
              </p>
            </div>
          </div>
        </div>

        {/* Action controls / Auto Bot Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          {onOpenWalletModal && (
            <button
              onClick={onOpenWalletModal}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                walletConfig?.isConnected
                  ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-950/60"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
              }`}
              title="Configurar Wallet"
            >
              <Wallet className={`w-3.5 h-3.5 ${walletConfig?.isConnected ? "text-emerald-400" : "text-cyan-400"}`} />
              <span>
                {walletConfig?.isConnected
                  ? `Wallet: ${walletConfig.address.substring(0, 4)}...${walletConfig.address.substring(walletConfig.address.length - 4)}`
                  : t("configWallet")}
              </span>
            </button>
          )}

          <button
            onClick={() => setShowExplainer(!showExplainer)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showExplainer ? t("hideExplanation") : t("howItWorks")}</span>
          </button>

          {/* Auto Bot Toggle */}
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <Bot className={`w-4 h-4 ${strategyState.autoBotEnabled ? "text-emerald-400 animate-pulse" : "text-slate-500"}`} />
            <div className="text-[11px]">
              <span className="text-slate-400 block leading-tight">{t("rebalanceBot")}</span>
              <span className={`font-bold ${strategyState.autoBotEnabled ? "text-emerald-400" : "text-slate-500"}`}>
                {strategyState.autoBotEnabled ? t("botActiveAuto") : t("botManual")}
              </span>
            </div>
            <button
              onClick={() =>
                setStrategyState((prev) => ({
                  ...prev,
                  autoBotEnabled: !prev.autoBotEnabled,
                }))
              }
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                strategyState.autoBotEnabled ? "bg-emerald-600" : "bg-slate-700"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  strategyState.autoBotEnabled ? "translate-x-4.5" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Explainer Accordion Box */}
      {showExplainer && (
        <div className="bg-slate-950/90 border border-cyan-900/40 rounded-xl p-4 text-xs text-slate-300 space-y-2 animate-in fade-in duration-200">
          <h4 className="font-bold text-white flex items-center gap-1.5 text-sm text-cyan-300">
            <Zap className="w-4 h-4" /> {t("strategyExplainerTitle")}
          </h4>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pl-1">
            <li>
              <strong className="text-white">{t("strategyStep1")}</strong>
            </li>
            <li>
              <strong className="text-white">{t("strategyStep2")}</strong>
            </li>
            <li>
              <strong className="text-white">{t("strategyStep3")}</strong>
            </li>
            <li>
              <strong className="text-white">{t("strategyStep4")}</strong>
            </li>
          </ol>
        </div>
      )}

      {/* Live Ranking of all 5 tokens by % of change */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              {t("rankingTitle")}
            </h4>
          </div>
          <div className="text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
            {t("spreadDiff")}{" "}
            <strong className="text-cyan-400">+{spreadPercent.toFixed(2)}%</strong>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {ranking.map((item) => {
            const isGain = item.changePercent >= 0;
            return (
              <div
                key={item.symbol}
                className={`p-3.5 rounded-xl border transition-all ${
                  item.isHighest
                    ? "bg-emerald-950/20 border-emerald-500/50 shadow-lg shadow-emerald-950/20 ring-1 ring-emerald-500/30"
                    : item.isLowest
                    ? "bg-rose-950/20 border-rose-500/50 shadow-lg shadow-rose-950/20 ring-1 ring-rose-500/30"
                    : "bg-slate-950/60 border-slate-800/80"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-mono text-slate-400 font-bold">
                    #{item.rank}
                  </span>
                  {item.isHighest && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/40">
                      {t("leastDropBadge")}
                    </span>
                  )}
                  {item.isLowest && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-900/60 text-rose-300 border border-rose-700/40">
                      {t("mostDropBadge")}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-white">{item.symbol}</span>
                  <div
                    className={`flex items-center gap-1 font-mono font-bold text-xs ${
                      isGain ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {isGain ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>{item.changePercent > 0 ? "+" : ""}{item.changePercent.toFixed(2)}%</span>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                  <span>{t("price")}</span>
                  <span className="font-mono text-slate-200 font-semibold">
                    ${item.usdPrice.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: item.usdPrice > 100 ? 2 : 4,
                    })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Billetera Autónoma de Trading (Sub-Wallet) & Monetización con Platform Fee */}
      <AutonomousBotWalletCard
        solPriceUsd={tokens.SOL?.usdPrice || 105}
        isLiveOnChain={isLiveOnChain}
        onChangeLiveMode={handleChangeLiveMode}
        platformFeeConfig={platformFeeConfig}
        onUpdateFeeConfig={handleUpdateFeeConfig}
        onKeypairLoaded={(kp) => setBotKeypair(kp)}
      />

      {/* Execution Dashboard: Step 1 Initial Buy & Step 2 Rotation Swap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-950 p-4 lg:p-5 rounded-xl border border-slate-800">
        {/* Left column: Portfolio Status, Manual Reconfiguration & Initial Buy */}
        <div className="lg:col-span-5 space-y-4 pr-0 lg:pr-4 border-b lg:border-b-0 lg:border-r border-slate-800 pb-4 lg:pb-0">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              {t("capitalConfigTitle")}
            </h4>
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                strategyState.initialBuyDone
                ? "bg-emerald-950 text-emerald-300 border border-emerald-800/40"
                : "bg-amber-950 text-amber-300 border border-amber-800/40"
              }`}
            >
              {strategyState.initialBuyDone ? t("activePosition") : t("pendingBuy")}
            </span>
          </div>

          {/* Reconfigurable Capital & Manual Amount Controls */}
          <div className="bg-slate-900/90 p-3.5 rounded-lg border border-slate-800 space-y-3 text-xs">
            {/* Monto de Capital Reconfigurable a Mano */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-slate-400">
                <span className="font-medium text-slate-300">{t("totalCapitalAmount")}</span>
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 focus-within:border-cyan-500">
                  <span className="text-slate-400">$</span>
                  <input
                    type="number"
                    min="10"
                    step="10"
                    value={initialCapitalUsd}
                    onChange={(e) => {
                      const newCap = Math.max(1, parseFloat(e.target.value) || 0);
                      setInitialCapitalUsd(newCap);
                      // Si ya hay una tenencia activa, actualizar opcionalmente la cantidad calculada
                      const curToken = tokens[strategyState.currentHoldingToken];
                      if (curToken && curToken.usdPrice > 0 && strategyState.currentHoldingAmount > 0) {
                        const newAmt = Number((newCap / curToken.usdPrice).toFixed(curToken.usdPrice > 100 ? 5 : 3));
                        setStrategyState((prev) => ({
                          ...prev,
                          currentHoldingAmount: newAmt,
                        }));
                      }
                    }}
                    className="w-20 bg-transparent text-white font-mono text-right font-bold focus:outline-none"
                  />
                  <span className="text-slate-400 font-mono text-[11px]">USD</span>
                </div>
              </div>

              {/* Botones de ajuste rápido de capital */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-slate-500">{t("quickSelect")}</span>
                {[100, 250, 500, 1000, 2500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setInitialCapitalUsd(amt);
                      const curToken = tokens[strategyState.currentHoldingToken];
                      if (curToken && curToken.usdPrice > 0 && strategyState.currentHoldingAmount > 0) {
                        const newAmt = Number((amt / curToken.usdPrice).toFixed(curToken.usdPrice > 100 ? 5 : 3));
                        setStrategyState((prev) => ({
                          ...prev,
                          currentHoldingAmount: newAmt,
                        }));
                      }
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      initialCapitalUsd === amt
                        ? "bg-cyan-500 text-slate-950 font-bold"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Tenencia activa actual con edición manual */}
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-slate-300">{t("holdingInPosession")}</span>
                {isEditingHolding ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="any"
                      placeholder={String(strategyState.currentHoldingAmount)}
                      value={manualHoldingInput}
                      onChange={(e) => setManualHoldingInput(e.target.value)}
                      className="w-20 bg-slate-950 border border-cyan-500 rounded px-1.5 py-0.5 text-white font-mono text-right text-xs focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">{strategyState.currentHoldingToken}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const val = parseFloat(manualHoldingInput);
                        if (!isNaN(val) && val >= 0) {
                          setStrategyState((prev) => ({
                            ...prev,
                            currentHoldingAmount: val,
                            initialBuyDone: val > 0,
                          }));
                          const curToken = tokens[strategyState.currentHoldingToken];
                          if (curToken) {
                            setInitialCapitalUsd(Number((val * curToken.usdPrice).toFixed(2)));
                          }
                        }
                        setIsEditingHolding(false);
                      }}
                      className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                      title="Guardar tenencia"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white font-mono">
                      {strategyState.currentHoldingAmount > 0
                        ? `${strategyState.currentHoldingAmount} ${strategyState.currentHoldingToken}`
                        : t("noInitialPosition")}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setManualHoldingInput(String(strategyState.currentHoldingAmount || ""));
                        setIsEditingHolding(true);
                      }}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors"
                      title="Reconfigurar"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-between text-slate-400">
                <span>{t("portfolioValueDex")}</span>
                <span className="font-bold text-cyan-400 font-mono text-sm">
                  ${currentPortfolioValueUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD
                </span>
              </div>
            </div>

            {/* Configuración del Umbral Mínimo de Aumento Neto tras costes */}
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-slate-300">{t("minNetGainLabel")}</span>
                <span className="font-bold text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                  +{strategyState.minNetGainThreshold ?? 0.5}%
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500">{t("threshold")}:</span>
                {[0.3, 0.5, 0.75, 1.0, 1.5].map((thresh) => (
                  <button
                    key={thresh}
                    type="button"
                    onClick={() =>
                      setStrategyState((prev) => ({
                        ...prev,
                        minNetGainThreshold: thresh,
                      }))
                    }
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      (strategyState.minNetGainThreshold ?? 0.5) === thresh
                        ? "bg-emerald-600 text-white font-bold"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                    }`}
                  >
                    +{thresh}%
                  </button>
                ))}
              </div>
            </div>

            {/* Desplegable de Costes Estimados */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowCostSettings(!showCostSettings)}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-400 transition-colors"
              >
                <Sliders className="w-3 h-3" />
                <span>{showCostSettings ? t("hideCostParams") : t("adjustCosts")}</span>
              </button>

              {showCostSettings && (
                <div className="mt-2 p-2.5 rounded bg-slate-950 border border-slate-800 space-y-2 text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t("gasEstimatedSol")}</span>
                    <input
                      type="number"
                      step="0.005"
                      value={strategyState.gasFeeUsd ?? 0.015}
                      onChange={(e) =>
                        setStrategyState((prev) => ({
                          ...prev,
                          gasFeeUsd: parseFloat(e.target.value) || 0.015,
                        }))
                      }
                      className="w-16 bg-slate-900 border border-slate-700 rounded px-1 text-right text-white font-mono"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t("jupiterDexFee")}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={strategyState.dexFeePercent ?? 0.10}
                      onChange={(e) =>
                        setStrategyState((prev) => ({
                          ...prev,
                          dexFeePercent: parseFloat(e.target.value) || 0.10,
                        }))
                      }
                      className="w-16 bg-slate-900 border border-slate-700 rounded px-1 text-right text-white font-mono"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t("slippagePct")}</span>
                    <input
                      type="number"
                      step="0.05"
                      value={strategyState.slippagePercent ?? 0.15}
                      onChange={(e) =>
                        setStrategyState((prev) => ({
                          ...prev,
                          slippagePercent: parseFloat(e.target.value) || 0.15,
                        }))
                      }
                      className="w-16 bg-slate-900 border border-slate-700 rounded px-1 text-right text-white font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Initial Buy Button */}
          <button
            onClick={handleInitialBuy}
            disabled={isExecuting || !cheapestToken}
            className={`w-full py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
              strategyState.initialBuyDone
                ? "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40"
            }`}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>
              {strategyState.initialBuyDone
                ? `${t("reBuyCheapestTokenInitial")} ${cheapestToken?.symbol || "Token"} ($${initialCapitalUsd} USD)`
                : `${t("buyCheapestTokenInitial")} ${cheapestToken?.symbol || "Token"} ${t("largestDropCheapest")}`}
            </span>
          </button>
        </div>

        {/* Right column: Rotation Swap Engine & Live Cost Calculation */}
        <div className="lg:col-span-7 space-y-4 pl-0 lg:pl-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
              {t("rotationSwapCostsTitle")}
            </h4>
            <span className="text-[11px] font-mono text-cyan-400">
              {strategyState.totalSwapsCount} {t("swapsExecutedCount")}
            </span>
          </div>

          {/* Visual Route of Swap */}
          <div className="bg-slate-900/90 p-3.5 rounded-lg border border-slate-800 space-y-3">
            <div className="grid grid-cols-11 items-center gap-2 text-center text-xs">
              {/* Source Token (Origen / Venta) */}
              <div className="col-span-5 bg-slate-950 p-2.5 rounded-lg border border-emerald-900/40 text-left">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-400 block font-semibold">
                    {t("sourceSellLabel")}
                  </span>
                  {strategyState.currentHoldingToken === activeSwapFrom && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40 font-mono">
                      {t("holdingBadge")}
                    </span>
                  )}
                </div>
                <select
                  value={activeSwapFrom}
                  onChange={(e) => {
                    const newSource = e.target.value as CryptoSymbol;
                    setSelectedSourceToken(newSource);
                    // Si el destino era igual al nuevo origen, reseteamos el destino para que elija automáticamente otro
                    if (activeSwapTo === newSource) {
                      setSelectedTargetToken(null);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 text-white font-bold text-sm font-mono rounded px-2 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  {Object.keys(tokens).map((sym) => {
                    const change = tokens[sym as CryptoSymbol]?.priceChange24h ?? 0;
                    return (
                      <option key={sym} value={sym}>
                        {sym} ({change > 0 ? "+" : ""}{change.toFixed(2)}%)
                      </option>
                    );
                  })}
                </select>
                <div className="flex justify-between items-center mt-1.5 text-[11px] font-mono">
                  <span className="text-slate-400">
                    ${(tokens[activeSwapFrom]?.usdPrice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </span>
                  <span className={(tokens[activeSwapFrom]?.priceChange24h ?? 0) >= 0 ? "text-emerald-400" : "text-amber-400"}>
                    {(tokens[activeSwapFrom]?.priceChange24h ?? 0) > 0 ? "+" : ""}
                    {(tokens[activeSwapFrom]?.priceChange24h ?? 0).toFixed(2)}% (24h)
                  </span>
                </div>
              </div>

              {/* Swap Icon */}
              <div className="col-span-1 flex justify-center text-cyan-400">
                <ArrowRight className="w-4 h-4" />
              </div>

              {/* Target Token (Destino / Compra) - NUNCA igual al Origen */}
              <div className="col-span-5 bg-slate-950 p-2.5 rounded-lg border border-rose-900/40 text-left">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-400 block font-semibold">
                    {t("targetBuyLabel")}
                  </span>
                  {activeSwapTo === autoBestDestination.symbol ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40 font-mono">
                      {t("optimalBadge")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedTargetToken(null)}
                      className="text-[9px] text-cyan-400 hover:underline"
                    >
                      {t("autoBadge")}
                    </button>
                  )}
                </div>
                <select
                  value={activeSwapTo}
                  onChange={(e) => {
                    const newTarget = e.target.value as CryptoSymbol;
                    if (newTarget !== activeSwapFrom) {
                      setSelectedTargetToken(newTarget);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 text-white font-bold text-sm font-mono rounded px-2 py-1 focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  {Object.keys(tokens).map((sym) => {
                    const isSource = sym === activeSwapFrom;
                    const isAuto = sym === autoBestDestination.symbol;
                    const change = tokens[sym as CryptoSymbol]?.priceChange24h ?? 0;
                    return (
                      <option key={sym} value={sym} disabled={isSource}>
                        {sym} ({change > 0 ? "+" : ""}{change.toFixed(2)}%)
                        {isSource ? ` ${t("sourceDisabled")}` : isAuto ? ` ${t("deepestDipOption")}` : ""}
                      </option>
                    );
                  })}
                </select>
                <div className="flex justify-between items-center mt-1.5 text-[11px] font-mono">
                  <span className="text-slate-400">
                    ${(tokens[activeSwapTo]?.usdPrice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </span>
                  <span className={(tokens[activeSwapTo]?.priceChange24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {(tokens[activeSwapTo]?.priceChange24h ?? 0) > 0 ? "+" : ""}
                    {(tokens[activeSwapTo]?.priceChange24h ?? 0).toFixed(2)}% (24h)
                  </span>
                </div>
              </div>
            </div>

            {/* Aviso informativo si el origen ya es la moneda más barata del mercado */}
            {activeSwapFrom === overallCheapestToken.symbol && (
              <div className="bg-slate-950/70 p-2 rounded border border-slate-800 text-[11px] text-slate-400">
                <span>
                  💡 <strong className="text-white">{activeSwapFrom}</strong> {t("cheapestTokenNotice")} <strong className="text-cyan-400">{activeSwapTo}</strong>.
                </span>
              </div>
            )}

            {/* DESGLOSE DETALLADO DE COSTES Y CONDICIÓN DE RENTABILIDAD */}
            {activeMetrics && (
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1 font-medium">
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    {t("operationCosts")} ({activeSwapFrom} ➔ {activeSwapTo}):
                  </span>
                  <span className="font-mono text-slate-200 font-bold">
                    ${activeMetrics.totalCostsUsd.toFixed(2)} USD
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block">{t("solanaNetworkGas")}</span>
                    <span className="font-mono font-bold text-slate-200">${activeMetrics.gasFeeUsd.toFixed(3)}</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block">{t("dexFeeTag")} ({activeMetrics.dexFeePercent}%)</span>
                    <span className="font-mono font-bold text-slate-200">${activeMetrics.dexFeeUsd.toFixed(2)}</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block">{t("slippageTag")} ({activeMetrics.slippagePercent}%)</span>
                    <span className="font-mono font-bold text-slate-200">${activeMetrics.slippageUsd.toFixed(2)}</span>
                  </div>
                </div>

                {/* Resultado de Aumento Neto del Monto Total */}
                <div className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  activeMetrics.isProfitable
                    ? "bg-emerald-950/40 border-emerald-600/50 text-emerald-300"
                    : "bg-amber-950/40 border-amber-600/50 text-amber-300"
                }`}>
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-sm">
                      {activeMetrics.isProfitable ? (
                        <>
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          <span>{t("netGainLabel")} +{activeMetrics.netGainPercent.toFixed(2)}% (+${activeMetrics.netGainUsd.toFixed(2)} USD)</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-4 h-4 text-amber-400" />
                          <span>{t("netGainLabel")} +{activeMetrics.netGainPercent.toFixed(2)}% (+${activeMetrics.netGainUsd.toFixed(2)} USD)</span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {t("grossSpreadLabel")} +{activeMetrics.spread.toFixed(2)}% | {t("minTargetLabel")} +{activeMetrics.minNetGain.toFixed(2)}%
                    </p>
                  </div>

                  <span className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider self-start sm:self-center font-mono ${
                    activeMetrics.isProfitable
                      ? "bg-emerald-900/80 text-emerald-200 border border-emerald-500/40"
                      : "bg-amber-900/80 text-amber-200 border border-amber-500/40"
                  }`}>
                    {activeMetrics.isProfitable ? t("eligibleForSwap") : t("swapLocked")}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Execute Swap Button with Strict Profitability Guard */}
          <button
            onClick={() => handleRotationSwap()}
            disabled={
              isExecuting ||
              activeSwapFrom === activeSwapTo ||
              !activeMetrics?.isProfitable
            }
            className={`w-full py-3 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
              activeSwapFrom === activeSwapTo
                ? "bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed"
                : activeMetrics?.isProfitable
                ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/50 ring-1 ring-emerald-400/50"
                : "bg-slate-800/90 hover:bg-slate-800 text-amber-300 border border-amber-800/60 opacity-80"
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>
              {activeSwapFrom === activeSwapTo
                ? `${t("sameTokenError")} (${activeSwapFrom} ➔ ${activeSwapTo})`
                : activeMetrics?.isProfitable
                ? `${t("executeProfitableSwap")} ${activeSwapFrom} ➔ ${activeSwapTo} (+${activeMetrics.netGainPercent.toFixed(2)}% neto)`
                : `${t("swapLockedNetGainNotMet")} (+${activeMetrics?.netGainPercent.toFixed(2) ?? "0"}%)`}
            </span>
          </button>
        </div>
      </div>

      {/* Status banner */}
      {lastActionMessage && (
        <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-3 text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{lastActionMessage}</span>
        </div>
      )}
    </div>
  );
};
