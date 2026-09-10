import React, { useState, useEffect, useRef } from "react";
import {
  CryptoSymbol,
  TokenPriceData,
  TokenRankingItem,
  RotationStrategyState,
  DexTransaction,
} from "../types";
import { soundEngine } from "../utils/audio";
import {
  TrendingDown,
  TrendingUp,
  ArrowRight,
  ArrowRightLeft,
  Play,
  CheckCircle,
  Sliders,
  ShieldCheck,
  HelpCircle,
  Info,
  Bot,
  Wallet,
  RotateCw,
  Edit3,
  Check,
  ShieldAlert,
  Lock,
  Scale,
  Zap,
  Coins,
  RefreshCw,
} from "lucide-react";
import { WalletConfig, PlatformFeeConfig } from "../types";
import { AutonomousBotWalletCard } from "./AutonomousBotWalletCard";
import {
  executeAutonomousSwap,
  DEFAULT_FEE_COLLECTOR,
  BotKeypairData,
  getOrCreateBotKeypair,
  WALLET_UPDATED_EVENT,
  fetchSolBalance,
  fetchWalletTokenHoldings,
  reclaimRentFromEmptyAccounts,
  checkEmptyTokenAccounts,
} from "../utils/solanaBot";
import { useLanguage } from "../utils/i18n";

// Tarifa base inmutable de gas en la red Solana (5,000 lamports por firma de transacción)
export const SOLANA_IMMUTABLE_GAS_FEE_SOL = 0.000005;

// Helper para obtener el saldo y valor comerciable de cada token en la sub-wallet:
// - Para tokens SPL (ZEC, BTC, ETH): todo el saldo es comerciable.
// - Para SOL: SOL es el activo de gas nativo de Solana. Se reserva obligatoriamente 0.0035 SOL para renta ATA y gas.
//   Si el saldo de SOL es menor o igual a 0.004 SOL, su saldo comerciable es 0 (es solo gas de red).
export const getTradableInfo = (
  sym: CryptoSymbol,
  holding: { balance: number; usdValue: number } | undefined,
  price: number
) => {
  const bal = holding?.balance || 0;
  let tradableBal = bal;
  if (sym === "SOL") {
    tradableBal = Math.max(0, bal - 0.0035);
    if (tradableBal < 0.0005) {
      tradableBal = 0;
    }
  }
  const tradableUsd = tradableBal * price;
  return {
    rawBalance: bal,
    tradableBalance: tradableBal,
    tradableUsd,
    isTradable: tradableBal > 0.000001 && tradableUsd >= 0.10,
  };
};

interface RotationStrategyPanelProps {
  tokens: Record<CryptoSymbol, TokenPriceData>;
  onExecuteSwap: (tx: DexTransaction) => void;
  transactions: DexTransaction[];
  walletConfig?: WalletConfig;
  onOpenWalletModal?: () => void;
  onUpdateWalletConfig?: (config: WalletConfig) => void;
  baselinePrices?: Record<CryptoSymbol, number>;
  botExecutionLaunchedAt?: string | null;
  onResetBaseline?: (newBaselines?: Record<CryptoSymbol, number>) => void;
}

export const RotationStrategyPanel: React.FC<RotationStrategyPanelProps> = ({
  tokens,
  onExecuteSwap,
  transactions,
  walletConfig,
  onOpenWalletModal,
  onUpdateWalletConfig,
  baselinePrices,
  botExecutionLaunchedAt,
  onResetBaseline,
}) => {
  const { t } = useLanguage();

  // Autonomous Sub-Wallet & Platform Fee state
  const [botKeypair, setBotKeypair] = useState<BotKeypairData>(() => getOrCreateBotKeypair());

  // Synchronize keypair when wallet is regenerated or imported in modal or card
  useEffect(() => {
    const handleWalletUpdated = (e: any) => {
      if (e.detail?.publicKey) {
        setBotKeypair(getOrCreateBotKeypair());
      }
    };
    window.addEventListener(WALLET_UPDATED_EVENT, handleWalletUpdated);
    return () => window.removeEventListener(WALLET_UPDATED_EVENT, handleWalletUpdated);
  }, []);

  // El bot opera exclusivamente en Modo Real (Solana Mainnet con Jupiter DEX)
  const isLiveOnChain = true;

  const [platformFeeConfig, setPlatformFeeConfig] = useState<PlatformFeeConfig>(() => {
    try {
      const saved = localStorage.getItem("pacharolo_platform_fee_config");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.feeCollectorAddress && !parsed.feeCollectorAddress.startsWith("PacharoLoFee")) {
          // Migrar tarifa anterior de 20 bps a 15 bps (0.15%) requerida por el usuario
          return {
            ...parsed,
            platformFeeBps: parsed.platformFeeBps === 20 || parsed.platformFeeBps === undefined ? 15 : parsed.platformFeeBps,
          };
        }
      }
    } catch (e) {
      console.warn("Could not read platform fee config:", e);
    }
    return {
      feeCollectorAddress: DEFAULT_FEE_COLLECTOR,
      platformFeeBps: 15, // 0.15% fijo transferido a tu wallet
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

  const handleChangeLiveMode = (_isLive: boolean) => {
    try {
      localStorage.setItem("pacharolo_live_onchain", "true");
    } catch (e) {
      console.warn("Could not save live mode:", e);
    }
    if (onUpdateWalletConfig) {
      onUpdateWalletConfig({
        ...walletConfig,
        mode: "REAL",
        address: botKeypair.publicKey,
        isConnected: true,
        paperBalanceUsd: 0,
      });
    }
  };

  // Wallet SOL balance state to reference capital directly to on-chain wallet funds
  const [walletSolBalance, setWalletSolBalance] = useState<number>(0);
  const [isLoadingWalletBal, setIsLoadingWalletBal] = useState<boolean>(false);

  // Strategy state initialized with persistence
  const [strategyState, setStrategyState] = useState<RotationStrategyState>(() => {
    try {
      const saved = localStorage.getItem("pacharolo_strategy_state");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          initialBuyDone: true,
          minNetGainThreshold: parsed.minNetGainThreshold ?? 0.1,
          scanFrequencyMs: parsed.scanFrequencyMs ?? 100,
          dexFeePercent: 0.00,
          slippagePercent: parsed.slippagePercent ?? 0.05,
        };
      }
    } catch {}
    return {
      initialBuyDone: true, // El usuario ya dispone de su tenencia inicial (ej: 0.195 SOL o ZEC)
      currentHoldingToken: "SOL",
      currentHoldingAmount: 0.195,
      autoBotEnabled: false,
      minSpreadThreshold: 2.0,
      minNetGainThreshold: 0.1, // Umbral configurable (default +0.1% neto tras costes para alta reactividad)
      scanFrequencyMs: 100, // 100ms (0.1s) - máxima velocidad web de reacción
      gasFeeUsd: 0.0005, // Calculado inmutablemente como 0.000005 SOL
      dexFeePercent: 0.00, // Jupiter DEX tiene 0.00% de comisiones de protocolo
      slippagePercent: 0.05,
      totalSwapsCount: 0,
      strategyPnlUsd: 0,
    };
  });

  // Capital asignado inicial en USD (referenciado a la tenencia en wallet)
  const [initialCapitalUsd, setInitialCapitalUsd] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("pacharolo_initial_capital");
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    } catch {}
    // Default referenciado a 0.195 SOL a precio de mercado (~$19.72 USD)
    const solPrice = tokens.SOL?.usdPrice || 101.14;
    return Number((0.195 * solPrice).toFixed(2));
  });

  // Persistir cambios en strategyState y capital
  useEffect(() => {
    try {
      localStorage.setItem("pacharolo_strategy_state", JSON.stringify(strategyState));
      localStorage.setItem("pacharolo_initial_capital", String(initialCapitalUsd));
    } catch {}
  }, [strategyState, initialCapitalUsd]);

  // Tenencias reales de tokens en la sub-wallet (SOL, BTC, ETH, JUP, USDC, ZEC)
  const [walletHoldings, setWalletHoldings] = useState<Record<CryptoSymbol, { symbol: CryptoSymbol; balance: number; rawAmount: string; decimals: number; usdValue: number; mint: string }>>({
    SOL: { symbol: "SOL", balance: 0, rawAmount: "0", decimals: 9, usdValue: 0, mint: "" },
    BTC: { symbol: "BTC", balance: 0, rawAmount: "0", decimals: 8, usdValue: 0, mint: "" },
    ETH: { symbol: "ETH", balance: 0, rawAmount: "0", decimals: 8, usdValue: 0, mint: "" },
    JUP: { symbol: "JUP", balance: 0, rawAmount: "0", decimals: 6, usdValue: 0, mint: "" },
    USDC: { symbol: "USDC", balance: 0, rawAmount: "0", decimals: 6, usdValue: 0, mint: "" },
    ZEC: { symbol: "ZEC", balance: 0, rawAmount: "0", decimals: 8, usdValue: 0, mint: "" },
  });
  const [isLoadingHoldings, setIsLoadingHoldings] = useState<boolean>(false);

  // Referencias mutables para evitar closures desactualizados en timers y WebSockets
  const walletHoldingsRef = useRef(walletHoldings);
  walletHoldingsRef.current = walletHoldings;

  const isExecutingRef = useRef(false);
  const [showFormulaModal, setShowFormulaModal] = useState<boolean>(false);

  const strategyStateRef = useRef(strategyState);
  strategyStateRef.current = strategyState;

  const lastSwappedToTokenRef = useRef<CryptoSymbol | null>(null);
  const lastSwappedAtRef = useRef<number>(0);

  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;

  const baselinePricesRef = useRef(baselinePrices);
  baselinePricesRef.current = baselinePrices;

  const initialLoadedRef = useRef(false);
  const isFetchingHoldingsRef = useRef(false);

  // Consulta y sincronización periódica de tenencias reales en la blockchain
  const refreshHoldings = React.useCallback(async (isManual = false) => {
    if (!botKeypair?.publicKey || isFetchingHoldingsRef.current) return;
    isFetchingHoldingsRef.current = true;
    if (!initialLoadedRef.current || isManual) {
      setIsLoadingHoldings(true);
      setIsLoadingWalletBal(true);
    }
    try {
      const currentTokens = tokensRef.current;
      const pricesMap: Partial<Record<CryptoSymbol, number>> = {
        SOL: currentTokens.SOL?.usdPrice,
        BTC: currentTokens.BTC?.usdPrice,
        ETH: currentTokens.ETH?.usdPrice,
        JUP: currentTokens.JUP?.usdPrice,
        USDC: currentTokens.USDC?.usdPrice,
        ZEC: currentTokens.ZEC?.usdPrice,
      };
      const result = await fetchWalletTokenHoldings(botKeypair.publicKey, pricesMap);

      // Si se acaba de realizar un swap recientemente (<15s) hacia un token (ej: ZEC)
      // y el RPC de Solana todavía no indexó la cuenta ATA, preservar la tenencia en memoria
      const recentlySwappedToken = lastSwappedToTokenRef.current;
      if (
        recentlySwappedToken &&
        Date.now() - lastSwappedAtRef.current < 15000 &&
        (!result[recentlySwappedToken] || result[recentlySwappedToken].balance <= 0.000001) &&
        walletHoldingsRef.current[recentlySwappedToken]?.balance > 0
      ) {
        result[recentlySwappedToken] = walletHoldingsRef.current[recentlySwappedToken];
      }

      setWalletHoldings(result);
      if (result.SOL) {
        setWalletSolBalance(result.SOL.balance);
      }

      // Identificar el token con mayor capital comerciable real en la blockchain
      let dominantSym: CryptoSymbol | null = null;
      let maxTradableUsd = -1;

      for (const sym of ["ZEC", "BTC", "ETH", "JUP", "USDC", "SOL"] as CryptoSymbol[]) {
        const info = getTradableInfo(sym, result[sym], pricesMap[sym] || 0);
        if (info.isTradable && info.tradableUsd > maxTradableUsd) {
          maxTradableUsd = info.tradableUsd;
          dominantSym = sym;
        }
      }

      const curToken = strategyStateRef.current?.currentHoldingToken || "SOL";
      const curInfo = getTradableInfo(curToken, result[curToken], pricesMap[curToken] || 0);

      // Si el activo actual en estado no tiene capital comerciable (ej. SOL con solo reserva de gas de 0.0035),
      // o si la blockchain muestra otro activo con saldo claramente dominante (ej. ZEC con $42 USD tras swap):
      if (dominantSym && (!curInfo.isTradable || (dominantSym !== curToken && maxTradableUsd > curInfo.tradableUsd + 1.0))) {
        const dominantHolding = result[dominantSym];
        const newBal = dominantSym === "SOL"
          ? Math.max(0.0001, Number((dominantHolding.balance - 0.0035).toFixed(5)))
          : dominantHolding.balance;

        setStrategyState((prev) => ({
          ...prev,
          currentHoldingToken: dominantSym!,
          currentHoldingAmount: newBal,
          initialBuyDone: true,
        }));
        setSelectedSourceToken(dominantSym);
        setSelectedTargetToken(null);
        setManualHoldingInput(String(newBal));
        setCustomSwapAmount("");
        setInitialCapitalUsd(Number((newBal * (pricesMap[dominantSym] || 1)).toFixed(2)));
      } else if (result[curToken]) {
        // Mantener sincronizado el monto exacto del activo actual
        const realBal = curToken === "SOL"
          ? Math.max(0.0001, Number(((result.SOL?.balance || 0) - 0.0035).toFixed(5)))
          : (result[curToken]?.balance || 0);
        if (realBal > 0 && Math.abs(strategyStateRef.current.currentHoldingAmount - realBal) > 0.00001) {
          setStrategyState((prev) => ({
            ...prev,
            currentHoldingAmount: realBal,
          }));
          setManualHoldingInput(String(realBal));
        }
      }

      initialLoadedRef.current = true;
    } catch (err) {
      console.warn("Error loading wallet token holdings:", err);
    } finally {
      isFetchingHoldingsRef.current = false;
      setIsLoadingHoldings(false);
      setIsLoadingWalletBal(false);
    }
  }, [botKeypair?.publicKey]);

  // Polling automático del saldo y tenencias de tokens en Solana cada 8 segundos
  useEffect(() => {
    refreshHoldings(false);
    const interval = setInterval(() => refreshHoldings(false), 8000);
    return () => clearInterval(interval);
  }, [refreshHoldings]);

  const [showExplainer, setShowExplainer] = useState(false);
  const [showCostSettings, setShowCostSettings] = useState(false);
  const [isEditingHolding, setIsEditingHolding] = useState(false);
  const [manualHoldingInput, setManualHoldingInput] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState(false);
  isExecutingRef.current = isExecuting;
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [selectedSourceToken, setSelectedSourceToken] = useState<CryptoSymbol | null>(null);
  const [selectedTargetToken, setSelectedTargetToken] = useState<CryptoSymbol | null>(null);

  // Manual swap amount input fields
  const [customSwapAmount, setCustomSwapAmount] = useState<string>(() => {
    return String(strategyState.currentHoldingAmount || "0.195");
  });
  const [swapAmountMode, setSwapAmountMode] = useState<"TOKEN" | "USD">("TOKEN");

  // Format helpers to prevent visual glitches like "+-0.22%" or "+$-0.04 USD"
  const formatSignedPercent = (val: number) => {
    return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
  };

  const formatSignedUsd = (val: number) => {
    if (val > 0) return `+$${val.toFixed(2)} USD`;
    if (val < 0) return `-$${Math.abs(val).toFixed(2)} USD`;
    return `$0.00 USD`;
  };

  // 1. Calculate and rank all 5 tokens by changeSinceExecution (percentage of change since bot execution was launched)
  const ranking: TokenRankingItem[] = (
    Object.keys(tokens) as CryptoSymbol[]
  )
    .map((sym) => {
      const t = tokens[sym];
      const basePrice = baselinePrices?.[sym] && baselinePrices[sym] > 0 ? baselinePrices[sym] : t.usdPrice;
      const changeSinceExecution = basePrice > 0 ? ((t.usdPrice - basePrice) / basePrice) * 100 : 0;
      return {
        symbol: sym,
        name: t.name,
        usdPrice: t.usdPrice,
        changePercent24h: t.priceChange24h,
        changeSinceExecution,
        baselinePrice: basePrice,
        rank: 0,
        isHighest: false,
        isLowest: false,
      };
    })
    .sort((a, b) => b.changeSinceExecution - a.changeSinceExecution) // Descending: highest % since execution (dropped least/gained most) at [0]
    .map((item, idx, arr) => ({
      ...item,
      rank: idx + 1,
      isHighest: idx === 0,
      isLowest: idx === arr.length - 1,
    }));

  const leastDropToken = ranking[0] || {
    symbol: "SOL" as CryptoSymbol,
    name: "Solana",
    usdPrice: 104,
    changePercent24h: 0,
    changeSinceExecution: 0,
    baselinePrice: 104,
    rank: 1,
    isHighest: true,
    isLowest: false,
  };
  const overallCheapestToken = ranking[ranking.length - 1] || leastDropToken;
  const rankingRef = useRef(ranking);
  rankingRef.current = ranking;

  // REGLA FUNDAMENTAL: El token de origen de venta NO PUEDE ser el token de destino de compra.
  // 1. Origen (Venta): Si el usuario seleccionó un token a mano, usarlo.
  // Si no, identificar el activo en posesión con capital real comerciable en la wallet.
  let dominantHoldingToken: CryptoSymbol | null = null;
  let highestTradableUsd = -1;
  for (const sym of ["ZEC", "BTC", "ETH", "JUP", "USDC", "SOL"] as CryptoSymbol[]) {
    const info = getTradableInfo(sym, walletHoldings[sym], tokens[sym]?.usdPrice || 0);
    if (info.isTradable && info.tradableUsd > highestTradableUsd) {
      highestTradableUsd = info.tradableUsd;
      dominantHoldingToken = sym;
    }
  }

  const currentTokenInfo = getTradableInfo(
    strategyState.currentHoldingToken,
    walletHoldings[strategyState.currentHoldingToken],
    tokens[strategyState.currentHoldingToken]?.usdPrice || 0
  );

  const preferredHoldingToken: CryptoSymbol =
    currentTokenInfo.isTradable
      ? strategyState.currentHoldingToken
      : (dominantHoldingToken || strategyState.currentHoldingToken || "SOL");

  const activeSwapFrom: CryptoSymbol = selectedSourceToken || preferredHoldingToken;

  // 2. Destino (Compra): Candidatos filtrados estrictamente para EXCLUIR el token de origen.
  const destinationCandidates = ranking.filter((t) => t.symbol !== activeSwapFrom);

  // La moneda óptima de destino es la de mayor caída (más barata) entre los tokens restantes desde la ejecución del bot:
  const autoBestDestination = destinationCandidates.length > 0
    ? destinationCandidates[destinationCandidates.length - 1]
    : ranking.find((t) => t.symbol !== activeSwapFrom) || {
        symbol: "BTC" as CryptoSymbol,
        name: "Bitcoin",
        usdPrice: 79000,
        changePercent24h: 0,
        changeSinceExecution: 0,
        baselinePrice: 79000,
        rank: 2,
        isHighest: false,
        isLowest: false,
      };

  // El token de destino activo nunca puede ser igual al de origen:
  const activeSwapTo: CryptoSymbol =
    selectedTargetToken && selectedTargetToken !== activeSwapFrom
      ? selectedTargetToken
      : autoBestDestination.symbol;

  const cheapestToken = overallCheapestToken;
  const spreadPercent = leastDropToken && cheapestToken
    ? leastDropToken.changeSinceExecution - cheapestToken.changeSinceExecution
    : 0;

  // Helper to calculate exact swap operation costs, net gain and +0.5% threshold condition
  // Basado estrictamente en el porcentaje de cambio desde el momento de ejecución del bot
  const calculateSwapMetrics = (
    fromSymbol: CryptoSymbol,
    toSymbol: CryptoSymbol,
    overrideAmount?: number
  ) => {
    // Protección estricta: origen y destino no pueden ser iguales
    if (fromSymbol === toSymbol) return null;

    const currentTokens = tokensRef.current || tokens;
    const fromToken = currentTokens[fromSymbol];
    const toToken = currentTokens[toSymbol];
    if (!fromToken || !toToken || fromToken.usdPrice <= 0 || toToken.usdPrice <= 0) return null;

    // Determinación del monto de origen:
    // 1. Si se pasó un override explícito
    // 2. Si el usuario configuró customSwapAmount a mano para este token en la interfaz
    // 3. Si la wallet tiene saldo real consultado en la blockchain
    // 4. Si tiene tenencia registrada en ese token
    // 5. Si no, según el capital inicial asignado
    let sourceAmount = 0;
    const realHolding = walletHoldingsRef.current[fromSymbol];
    const curState = strategyStateRef.current || strategyState;

    if (overrideAmount !== undefined && overrideAmount > 0) {
      sourceAmount = overrideAmount;
    } else if (fromSymbol === activeSwapFrom && customSwapAmount && !isNaN(parseFloat(customSwapAmount)) && parseFloat(customSwapAmount) > 0) {
      const parsed = parseFloat(customSwapAmount);
      sourceAmount = swapAmountMode === "USD" ? parsed / fromToken.usdPrice : parsed;
      if (realHolding && realHolding.balance > 0) {
        sourceAmount = Math.min(sourceAmount, realHolding.balance);
      }
    } else if (realHolding && realHolding.balance > 0) {
      sourceAmount = realHolding.balance;
    } else if (curState.currentHoldingAmount > 0 && curState.currentHoldingToken === fromSymbol) {
      sourceAmount = curState.currentHoldingAmount;
    } else {
      sourceAmount = Number((initialCapitalUsd / fromToken.usdPrice).toFixed(fromToken.usdPrice > 100 ? 5 : 3));
    }

    // Si el activo de origen es SOL, reservar para gas y renta de cuenta ATA (0.0035 SOL)
    // descontando las tarifas directamente de la cantidad a intercambiar para que el usuario no requiera saldo extra
    if (fromSymbol === "SOL" && realHolding && realHolding.balance > 0) {
      const gasReserve = 0.0035;
      const maxSafeSol = Math.max(0.0001, realHolding.balance - gasReserve);
      sourceAmount = Math.min(sourceAmount, maxSafeSol);
      sourceAmount = Number(sourceAmount.toFixed(4));
    } else if (fromSymbol !== "SOL" && realHolding && realHolding.balance > 0) {
      // Para tokens SPL (ej. BTC, ZEC, ETH): si se rota la tenencia o el saldo es muy cercano/superior,
      // utilizar exactamente la tenencia real sin redondear hacia arriba para evitar error 6024 en Jupiter
      if (sourceAmount >= realHolding.balance || Math.abs(sourceAmount - realHolding.balance) < 0.0001) {
        sourceAmount = realHolding.balance;
      } else {
        sourceAmount = Number(sourceAmount.toFixed(fromToken.usdPrice > 100 ? 6 : 4));
      }
    } else {
      sourceAmount = Number(sourceAmount.toFixed(fromToken.usdPrice > 100 ? 6 : 4));
    }
    const currentTotalValueUsd = sourceAmount * fromToken.usdPrice;

    // Precios base de ejecución
    const currentBaselines = baselinePricesRef.current || baselinePrices;
    const fromBase = currentBaselines?.[fromSymbol] && currentBaselines[fromSymbol] > 0 ? currentBaselines[fromSymbol] : fromToken.usdPrice;
    const toBase = currentBaselines?.[toSymbol] && currentBaselines[toSymbol] > 0 ? currentBaselines[toSymbol] : toToken.usdPrice;

    // Porcentajes de cambio DESDE EL MOMENTO DE LA EJECUCIÓN DEL BOT
    const fromChangeSinceExecution = fromBase > 0 ? ((fromToken.usdPrice - fromBase) / fromBase) * 100 : 0;
    const toChangeSinceExecution = toBase > 0 ? ((toToken.usdPrice - toBase) / toBase) * 100 : 0;

    // Operation costs
    // TARIFA DE GAS INMUTABLE EN 0.000005 SOL (Tarifa fija de 5,000 lamports en Solana Mainnet)
    const solPrice = currentTokens.SOL?.usdPrice || 101.14;
    const gasFeeSol = SOLANA_IMMUTABLE_GAS_FEE_SOL;
    const gasFeeUsd = gasFeeSol * solPrice;
    const dexFeePercent = 0.00; // Jupiter DEX tiene 0.00% de comisión de protocolo
    const slippagePercent = curState.slippagePercent ?? 0.05;
    const platformFeePercent = (platformFeeConfig.platformFeeBps ?? 15) / 100; // Tarifa a wallet creador: 0.15% (15 bps)

    const dexFeeUsd = currentTotalValueUsd * (dexFeePercent / 100);
    const slippageUsd = currentTotalValueUsd * (slippagePercent / 100);
    const platformFeeUsd = currentTotalValueUsd * (platformFeePercent / 100);

    // Auto-Recarga de Gas y Cobertura de Operación en SOL (propuesta de autosuficiencia):
    // Cuando se rota entre tokens SPL (ej. BTC ➔ ETH, ZEC ➔ BTC), si el saldo de SOL es inferior a 0.004 SOL
    // se calcula la micro-fracción de origen para recargar SOL y asegurar que el bot nunca se quede sin gas.
    const isSplToSpl = fromSymbol !== "SOL" && toSymbol !== "SOL";
    const currentSolBal = walletSolBalance;
    const gasRefuelThresholdSol = 0.004; // Umbral de seguridad para cubrir gas, ATA y comisiones on-chain
    const neededRefuelSol = isSplToSpl && currentSolBal < gasRefuelThresholdSol
      ? Math.max(0.001, Number((gasRefuelThresholdSol - currentSolBal).toFixed(4)))
      : 0;
    const gasRefuelUsd = neededRefuelSol * solPrice;

    const totalCostsUsd = gasFeeUsd + dexFeeUsd + slippageUsd + platformFeeUsd + gasRefuelUsd;

    // Spread and net increase CALCULADOS ESTRICTAMENTE DESDE LA EJECUCIÓN DEL BOT
    const spread = fromChangeSinceExecution - toChangeSinceExecution;
    const grossGainUsd = currentTotalValueUsd * (spread / 100);
    const netGainUsd = grossGainUsd - totalCostsUsd;
    const netGainPercent = currentTotalValueUsd > 0 ? (netGainUsd / currentTotalValueUsd) * 100 : 0;
    const minNetGain = curState.minNetGainThreshold ?? 0.1;
    const isProfitable = netGainPercent >= minNetGain;

    const netValueUsd = Math.max(0, currentTotalValueUsd - totalCostsUsd);
    const targetAmount = Number((netValueUsd / toToken.usdPrice).toFixed(toToken.usdPrice > 100 ? 5 : 4));

    return {
      fromSymbol,
      toSymbol,
      sourceAmount,
      targetAmount,
      fromPrice: fromToken.usdPrice,
      toPrice: toToken.usdPrice,
      fromBasePrice: fromBase,
      toBasePrice: toBase,
      fromChangeSinceExecution,
      toChangeSinceExecution,
      fromChange24h: fromToken.priceChange24h,
      toChange24h: toToken.priceChange24h,
      currentTotalValueUsd,
      gasFeeSol,
      gasFeeUsd,
      dexFeePercent,
      dexFeeUsd,
      slippagePercent,
      slippageUsd,
      platformFeePercent,
      platformFeeUsd,
      isSplToSpl,
      neededRefuelSol,
      gasRefuelUsd,
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

  // Active projection for the current proposed swap
  const activeMetrics = calculateSwapMetrics(activeSwapFrom, activeSwapTo);

  // Sincronizar capital total cuando se modifica la tenencia en posesión
  const handleUpdateHolding = (newAmount: number, tokenSym = strategyState.currentHoldingToken) => {
    const curToken = tokens[tokenSym];
    const price = curToken?.usdPrice || 1;
    const newCapUsd = Number((newAmount * price).toFixed(2));

    setInitialCapitalUsd(newCapUsd);
    setStrategyState((prev) => ({
      ...prev,
      currentHoldingToken: tokenSym,
      currentHoldingAmount: newAmount,
      initialBuyDone: newAmount > 0,
    }));
    setCustomSwapAmount(swapAmountMode === "USD" ? String(newCapUsd) : String(newAmount));
  };

  // Sincronizar tenencia y monto de trade cuando el usuario modifica el capital en USD
  const handleUpdateCapital = (val: number) => {
    setInitialCapitalUsd(val);
    const curToken = tokens[strategyState.currentHoldingToken];
    if (curToken && curToken.usdPrice > 0) {
      const newAmt = Number((val / curToken.usdPrice).toFixed(curToken.usdPrice > 100 ? 5 : 4));
      setStrategyState((prev) => ({
        ...prev,
        currentHoldingAmount: newAmt,
        initialBuyDone: true,
      }));
      setCustomSwapAmount(swapAmountMode === "USD" ? String(val) : String(newAmt));
    }
  };

  // Sincronizar capital y tenencia cuando el usuario edita el monto a rotar
  const handleTradeAmountChange = (rawVal: string, mode: "TOKEN" | "USD" = swapAmountMode) => {
    setCustomSwapAmount(rawVal);
    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed) && parsed > 0) {
      const curToken = tokens[activeSwapFrom];
      const price = curToken?.usdPrice || 1;
      if (mode === "TOKEN") {
        const newCapUsd = Number((parsed * price).toFixed(2));
        setInitialCapitalUsd(newCapUsd);
        setStrategyState((prev) => ({
          ...prev,
          currentHoldingToken: activeSwapFrom,
          currentHoldingAmount: parsed,
          initialBuyDone: true,
        }));
      } else {
        const newAmt = Number((parsed / price).toFixed(price > 100 ? 5 : 4));
        setInitialCapitalUsd(parsed);
        setStrategyState((prev) => ({
          ...prev,
          currentHoldingToken: activeSwapFrom,
          currentHoldingAmount: newAmt,
          initialBuyDone: true,
        }));
      }
    }
  };

  // Sincronizar capital y tenencia con el saldo real de la wallet en Solana
  const handleSyncWithWallet = () => {
    const solPrice = tokens.SOL?.usdPrice || 101.14;
    // Si la wallet tiene saldo, usarlo; de lo contrario mantener la referencia
    const balanceToUse = walletSolBalance > 0 ? walletSolBalance : 0.195;
    const newCapUsd = Number((balanceToUse * solPrice).toFixed(2));

    setInitialCapitalUsd(newCapUsd);
    setStrategyState((prev) => ({
      ...prev,
      currentHoldingToken: "SOL",
      currentHoldingAmount: balanceToUse,
      initialBuyDone: true,
    }));
    setSelectedSourceToken("SOL");
    setSelectedTargetToken(null);
    setCustomSwapAmount(swapAmountMode === "USD" ? String(newCapUsd) : String(balanceToUse));
    setManualHoldingInput(String(balanceToUse));

    soundEngine.playAlertChime("high");
    setLastActionMessage(
      `✓ Capital y tenencia sincronizados con la wallet: ${balanceToUse.toFixed(4)} SOL (~$${newCapUsd} USD).`
    );
  };

  // Selección de activo de la tenencia para el trade automático y monto
  const handleSelectHoldingForTrade = (sym: CryptoSymbol, customAmount?: number) => {
    const holding = walletHoldings[sym];
    const bal = holding?.balance || 0;
    const tokenData = tokens[sym];
    const price = tokenData?.usdPrice || 1;
    let amountToUse = customAmount !== undefined
      ? customAmount
      : (bal > 0
          ? (sym === "SOL" ? Math.max(0.0001, Number((bal - 0.0035).toFixed(5))) : bal)
          : Number((initialCapitalUsd / price).toFixed(price > 100 ? 5 : 4)));
    if (sym === "SOL") {
      amountToUse = Number(amountToUse.toFixed(5));
    }
    const newCapUsd = Number((amountToUse * price).toFixed(2));

    setStrategyState((prev) => ({
      ...prev,
      currentHoldingToken: sym,
      currentHoldingAmount: amountToUse,
      initialBuyDone: true,
    }));
    setSelectedSourceToken(sym);
    setSelectedTargetToken(null);
    setManualHoldingInput(String(amountToUse));
    setCustomSwapAmount(swapAmountMode === "USD" ? String(newCapUsd) : String(amountToUse));
    setInitialCapitalUsd(newCapUsd);

    soundEngine.playAlertChime("high");
    setLastActionMessage(`✓ Activo para trade seleccionado: ${amountToUse} ${sym} ($${newCapUsd} USD).`);
  };

  const [autoBotStatus, setAutoBotStatus] = useState<{
    bestCandidate: CryptoSymbol | null;
    currentGain: number;
    threshold: number;
    lastScanTime: number;
    isTriggering: boolean;
  }>({
    bestCandidate: null,
    currentGain: 0,
    threshold: 0.1,
    lastScanTime: Date.now(),
    isTriggering: false,
  });

  // Handle Step 2: Swap from the source token to the target token (STRICTLY DIFFERENT)
  const handleRotationSwap = async (
    customSource?: CryptoSymbol,
    customTarget?: CryptoSymbol,
    forceManual = false
  ) => {
    if (isExecutingRef.current) return;

    const fromSymbol = customSource || activeSwapFrom;
    const toSymbol = customTarget || activeSwapTo;

    if (fromSymbol === toSymbol) {
      alert("El token de origen de venta no puede ser el mismo que el de destino de compra. Elige dos activos diferentes.");
      return;
    }

    // Prevenir enviar transacciones que fallen por saldo insuficiente en tokens SPL o SOL
    let sourceHolding = walletHoldingsRef.current[fromSymbol];
    let sourceBal = sourceHolding?.balance || 0;

    // Si el balance en cache es 0, consultar inmediatamente on-chain para evitar falsos negativos
    if (sourceBal <= 0.000001 && botKeypair?.publicKey) {
      try {
        const freshHoldings = await fetchWalletTokenHoldings(botKeypair.publicKey);
        if (freshHoldings[fromSymbol]?.balance > 0) {
          sourceBal = freshHoldings[fromSymbol].balance;
          setWalletHoldings(freshHoldings);
          walletHoldingsRef.current = freshHoldings;
        }
      } catch {}
    }

    if (fromSymbol !== "SOL" && sourceBal <= 0.000001) {
      soundEngine.playAlertChime("low");
      const availableTokens = (["ZEC", "SOL", "BTC", "ETH"] as CryptoSymbol[])
        .filter((sym) => (walletHoldingsRef.current[sym]?.balance || 0) > 0.000001)
        .map((sym) => `${sym} (${(walletHoldingsRef.current[sym]?.balance || 0).toFixed(sym === "SOL" ? 4 : 5)})`)
        .join(", ");

      setLastActionMessage(
        `⚠️ Swap cancelado: No tienes saldo disponible de ${fromSymbol} en tu sub-wallet (${botKeypair.publicKey.substring(0, 4)}...${botKeypair.publicKey.substring(botKeypair.publicKey.length - 4)}). ${
          availableTokens ? `Tokens con saldo disponibles: ${availableTokens}.` : "Deposita fondos en tu sub-wallet."
        }`
      );
      return;
    }

    // Comprobación de saldo de SOL para gas:
    // En Solana, todas las transacciones (incluso swaps de tokens SPL como ZEC/BTC/ETH) requieren una pequeña tarifa de red en SOL (~0.000005 a 0.0008 SOL)
    let currentSolBalance = walletSolBalance;
    if (walletHoldingsRef.current.SOL && walletHoldingsRef.current.SOL.balance > currentSolBalance) {
      currentSolBalance = walletHoldingsRef.current.SOL.balance;
    }
    if (currentSolBalance < 0.000005 && botKeypair?.publicKey) {
      try {
        const freshSol = await fetchSolBalance(botKeypair.publicKey);
        if (freshSol > 0) {
          currentSolBalance = freshSol;
          setWalletSolBalance(freshSol);
        }
      } catch {}
    }

    if (fromSymbol === "SOL" && currentSolBalance < 0.0008) {
      soundEngine.playAlertChime("low");
      setLastActionMessage(
        `⚠️ Saldo insuficiente en SOL (${currentSolBalance.toFixed(5)} SOL). Se requieren al menos 0.0008 SOL para cubrir las tarifas de transacción en Solana.`
      );
      return;
    } else if (fromSymbol !== "SOL" && currentSolBalance < 0.000005) {
      soundEngine.playAlertChime("low");
      setLastActionMessage(
        `⚠️ Saldo insuficiente en SOL (${currentSolBalance.toFixed(5)} SOL) para gas. Se requiere al menos 0.000005 SOL en la sub-wallet para pagar la tarifa de red de Solana al intercambiar ${fromSymbol}.`
      );
      return;
    }

    const metrics = calculateSwapMetrics(fromSymbol, toSymbol);
    if (!metrics) return;

    // VALIDACIÓN: Solo bloquear por umbral si NO es un swap forzado manualmente por el usuario
    if (!forceManual && !metrics.isProfitable) {
      soundEngine.playAlertChime("low");
      setLastActionMessage(
        `⚠️ Swap en espera: El aumento neto estimado (+${metrics.netGainPercent.toFixed(2)}%) es inferior al mínimo requerido de +${metrics.minNetGain.toFixed(2)}% tras costes ($${metrics.totalCostsUsd.toFixed(2)} USD). Puedes pulsar 'Forzar Swap Manual' para ejecutarlo de inmediato con tus fondos.`
      );
      return;
    }

    setIsExecuting(true);
    soundEngine.playAlertChime("high");

    // Ejecución autónoma (firma desatendida y cobro de Platform Fee de Jupiter)
    let txHash = `${Math.random().toString(36).substring(2, 7).toUpperCase()}...JUP`;
    let platformFeeEarnedUsd = (metrics.currentTotalValueUsd * platformFeeConfig.platformFeeBps) / 10000;
    let actualIsRealOnChain = false;
    let actualFeeTxHash = "";
    let actualFeeErrorMessage = "";

    try {
      // Prevenir error 6024 y fallos de 'close account' pasando exactRawAmount para tokens SPL
      const holding = walletHoldingsRef.current[fromSymbol];
      let exactRawAmount: string | undefined = undefined;
      let effectiveAmount = metrics.sourceAmount;
      if (holding && fromSymbol !== "SOL") {
        if (effectiveAmount > holding.balance || holding.balance <= 0) {
          effectiveAmount = holding.balance;
        }
        if (holding.rawAmount && holding.rawAmount !== "0" && (effectiveAmount >= holding.balance * 0.90 || Math.abs(effectiveAmount - holding.balance) < 0.0001)) {
          exactRawAmount = holding.rawAmount;
        }
      }

      // Si es un swap SPL a SPL (ej. BTC ➔ ETH) y la reserva de SOL es menor a 0.0035 SOL,
      // realizamos un micro-swap simultáneo preliminar de fromSymbol ➔ SOL para reponer gas
      // y dejar la sub-wallet lista para pagar gas y abrir la cuenta ATA de toSymbol
      const solPriceUsd = tokens.SOL?.usdPrice || 105;
      if (isLiveOnChain && metrics.isSplToSpl && metrics.neededRefuelSol > 0 && effectiveAmount > 0) {
        try {
          // Descontar una micro-fracción de origen (máximo 8% del total a intercambiar)
          const maxRefuelSpend = effectiveAmount * 0.08;
          const desiredSpend = (metrics.neededRefuelSol * solPriceUsd) / metrics.fromPrice;
          const refuelSpend = Math.min(maxRefuelSpend, desiredSpend);

          if (refuelSpend > 0 && refuelSpend < effectiveAmount) {
            console.log(`[AutoRefuel] Ejecutando micro-swap ${fromSymbol} ➔ SOL (${refuelSpend.toFixed(6)} ${fromSymbol}) para reponer gas.`);
            const refuelRes = await executeAutonomousSwap({
              fromSymbol,
              toSymbol: "SOL",
              amount: refuelSpend,
              sourceUsdPrice: metrics.fromPrice,
              targetUsdPrice: solPriceUsd,
              secretKeyBase58: botKeypair.secretKeyBase58,
              isLiveOnChain: true,
              platformFeeBps: 0, // No cobrar comisión de creador sobre el auto-refuel de gas
              feeCollectorAddress: platformFeeConfig.feeCollectorAddress,
              solPriceUsd,
            });

            if (refuelRes.success && refuelRes.txHash) {
              console.log(`[AutoRefuel] Micro-swap exitoso. Gas SOL repuesto en tx: ${refuelRes.txHash}`);
              effectiveAmount = Math.max(0, effectiveAmount - refuelSpend);
              // Como se gastó una parte del rawAmount en el refuel, resetear exactRawAmount para evitar overflow
              exactRawAmount = undefined;
              // Actualizar saldo de SOL local de inmediato
              const updatedSol = await fetchSolBalance(botKeypair.publicKey);
              setWalletSolBalance(updatedSol);
            }
          }
        } catch (refuelErr) {
          console.warn("[AutoRefuel] No se pudo ejecutar micro-swap preliminar de gas, continuando con swap principal:", refuelErr);
        }
      }

      const swapResult = await executeAutonomousSwap({
        fromSymbol,
        toSymbol,
        amount: effectiveAmount,
        sourceUsdPrice: metrics.fromPrice,
        targetUsdPrice: metrics.toPrice,
        secretKeyBase58: botKeypair.secretKeyBase58,
        isLiveOnChain,
        platformFeeBps: platformFeeConfig.platformFeeBps,
        feeCollectorAddress: platformFeeConfig.feeCollectorAddress,
        exactRawAmount,
        solPriceUsd,
      });

      // En Modo Real, si falla la ejecución on-chain, mostrar el error real de la red
      if (!swapResult.success || !swapResult.isRealOnChain) {
        setIsExecuting(false);
        soundEngine.playAlertChime("low");
        const errMsg = swapResult.errorMessage || "Fallo al procesar en la red Solana Mainnet.";
        setLastActionMessage(
          `⚠️ Swap detenido por Jupiter DEX: ${errMsg} [Sub-wallet: ${botKeypair.publicKey.substring(0, 6)}...${botKeypair.publicKey.substring(botKeypair.publicKey.length - 4)} | Saldo real detectado: ${walletSolBalance.toFixed(4)} SOL]`
        );
        return;
      }

      if (swapResult.txHash) {
        txHash = swapResult.txHash;
      }
      if (swapResult.platformFeeUsd) {
        platformFeeEarnedUsd = swapResult.platformFeeUsd;
      }
      if (swapResult.feeTxHash) {
        actualFeeTxHash = swapResult.feeTxHash;
      }
      if (swapResult.feeErrorMessage) {
        actualFeeErrorMessage = swapResult.feeErrorMessage;
      }
      actualIsRealOnChain = true;
      // Refrescar de inmediato las tenencias de tokens on-chain
      setTimeout(() => refreshHoldings(true), 1500);

      // Reclamar automáticamente renta de cuentas de tokens vacías para recuperar SOL de gas
      setTimeout(async () => {
        try {
          const reclaimRes = await reclaimRentFromEmptyAccounts(botKeypair.secretKeyBase58);
          if (reclaimRes.success && reclaimRes.reclaimedSol > 0) {
            console.log(`[RentReclaim] Recuperados ${reclaimRes.reclaimedSol.toFixed(5)} SOL de renta.`);
            const newBal = await fetchSolBalance(botKeypair.publicKey);
            setWalletSolBalance(newBal);
          }
        } catch {}
      }, 2500);
    } catch (swapErr: any) {
      setIsExecuting(false);
      isExecutingRef.current = false;
      soundEngine.playAlertChime("low");
      setLastActionMessage(
        `⚠️ Error en Modo Real: ${swapErr?.message || "No se pudo transmitir la transacción a Solana"}. [Sub-wallet: ${botKeypair.publicKey.substring(0, 6)}...${botKeypair.publicKey.substring(botKeypair.publicKey.length - 4)} | Saldo real detectado: ${walletSolBalance.toFixed(4)} SOL]`
      );
      return;
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
      dex: "Jupiter DEX (Solana Mainnet)",
      wallet: `Sub-Wallet (${botKeypair.publicKey.substring(0, 4)}...${botKeypair.publicKey.substring(botKeypair.publicKey.length - 4)})`,
      status: "CONFIRMED",
      isRealOnChain: true,
      feeTxHash: actualFeeTxHash || undefined,
    };

    onExecuteSwap(swapTx);

    // Registrar comisiones ganadas para el creador del bot
    handleUpdateFeeConfig({
      ...platformFeeConfig,
      totalFeesCollectedUsd: platformFeeConfig.totalFeesCollectedUsd + platformFeeEarnedUsd,
      totalSwapsMonetized: platformFeeConfig.totalSwapsMonetized + 1,
    });

    try {
      window.dispatchEvent(new CustomEvent("creator_fee_updated", { detail: { feeTxHash: actualFeeTxHash } }));
    } catch {
      // safe ignore
    }

    // Guardar timestamp del swap para evitar que RPCs lentos reviertan a SOL
    lastSwappedToTokenRef.current = toSymbol;
    lastSwappedAtRef.current = Date.now();

    // Actualización optimista inmediata de tenencias en memoria
    const optimisticHoldings = {
      ...walletHoldingsRef.current,
      [toSymbol]: {
        symbol: toSymbol,
        balance: metrics.targetAmount,
        rawAmount: "0",
        decimals: toSymbol === "SOL" ? 9 : (toSymbol === "JUP" || toSymbol === "USDC") ? 6 : 8,
        usdValue: Number(metrics.netValueUsd.toFixed(2)),
        mint: walletHoldingsRef.current[toSymbol]?.mint || "",
      },
      [fromSymbol]: {
        symbol: fromSymbol,
        balance: fromSymbol === "SOL" ? Math.max(0, walletSolBalance - metrics.sourceAmount) : 0,
        rawAmount: "0",
        decimals: fromSymbol === "SOL" ? 9 : (fromSymbol === "JUP" || fromSymbol === "USDC") ? 6 : 8,
        usdValue: fromSymbol === "SOL" ? Math.max(0, walletSolBalance - metrics.sourceAmount) * (tokens.SOL?.usdPrice || 100) : 0,
        mint: walletHoldingsRef.current[fromSymbol]?.mint || "",
      },
    };
    setWalletHoldings(optimisticHoldings);
    walletHoldingsRef.current = optimisticHoldings;

    setStrategyState((prev) => ({
      ...prev,
      initialBuyDone: true,
      currentHoldingToken: toSymbol,
      currentHoldingAmount: metrics.targetAmount,
      lastSwapAt: now,
      totalSwapsCount: prev.totalSwapsCount + 1,
    }));

    // Actualizar el punto de referencia de precios para el siguiente ciclo de rotación
    if (onResetBaseline) {
      onResetBaseline();
    }

    setInitialCapitalUsd(Number(metrics.netValueUsd.toFixed(2)));
    setCustomSwapAmount("");
    setSelectedSourceToken(toSymbol);
    setSelectedTargetToken(null);
    setManualHoldingInput(String(metrics.targetAmount));

    let feeReport = "";
    if (actualFeeTxHash) {
      feeReport = ` | Tarifa creador (0.15%): enviada on-chain (${actualFeeTxHash.substring(0, 4)}...${actualFeeTxHash.substring(actualFeeTxHash.length - 4)})`;
    } else if (actualFeeErrorMessage) {
      feeReport = ` | Tarifa: ${actualFeeErrorMessage}`;
    }

    setLastActionMessage(
      `✓ Swap completado en Solana Mainnet: ${metrics.sourceAmount} ${fromSymbol} ➔ ${metrics.targetAmount} ${toSymbol} (+${metrics.netGainPercent.toFixed(2)}% neto | Fee plataforma: $${platformFeeEarnedUsd.toFixed(3)} USD${feeReport}). Ahora en posesión de ${toSymbol}, listo para el próximo ciclo.`
    );

    setTimeout(() => refreshHoldings(true), 1500);
    setTimeout(() => refreshHoldings(true), 4000);
    setTimeout(() => refreshHoldings(true), 8000);

    setTimeout(() => setIsExecuting(false), 400);
  };

  // Handle Step 1: Real on-chain initial purchase of the cheapest token from SOL via Jupiter DEX
  const handleInitialBuy = async () => {
    if (!cheapestToken || isExecutingRef.current) return;
    const targetToken = cheapestToken.symbol === "SOL" ? "BTC" : cheapestToken.symbol;

    if (onResetBaseline) {
      onResetBaseline();
    }

    await handleRotationSwap("SOL", targetToken, true);
  };

  // Selección manual de moneda inicial o en tenencia en el portafolio
  const handleSelectInitialToken = (token: CryptoSymbol) => {
    const tokenData = tokens[token];
    if (!tokenData || tokenData.usdPrice <= 0) return;
    const newAmount = Number((initialCapitalUsd / tokenData.usdPrice).toFixed(tokenData.usdPrice > 100 ? 5 : 4));
    setStrategyState((prev) => ({
      ...prev,
      currentHoldingToken: token,
      currentHoldingAmount: newAmount,
      initialBuyDone: true,
    }));
    setSelectedSourceToken(token);
    setSelectedTargetToken(null);
    setManualHoldingInput(String(newAmount));
    setCustomSwapAmount(swapAmountMode === "USD" ? String(initialCapitalUsd) : String(newAmount));
  };

  // Disparo manual inmediato de la rotación automática con la mejor opción actual
  const executeAutoSwapNow = React.useCallback(async () => {
    if (isExecutingRef.current) return;
    const curState = strategyStateRef.current;
    const curRanking = rankingRef.current;

    let fromSym = curState.currentHoldingToken || "SOL";
    const curTradable = getTradableInfo(fromSym, walletHoldingsRef.current[fromSym], tokensRef.current[fromSym]?.usdPrice || 0);

    if (!curTradable.isTradable) {
      let dominant: CryptoSymbol | null = null;
      let maxUsd = -1;
      for (const sym of ["ZEC", "BTC", "ETH", "JUP", "USDC", "SOL"] as CryptoSymbol[]) {
        const info = getTradableInfo(sym, walletHoldingsRef.current[sym], tokensRef.current[sym]?.usdPrice || 0);
        if (info.isTradable && info.tradableUsd > maxUsd) {
          maxUsd = info.tradableUsd;
          dominant = sym;
        }
      }
      if (dominant) {
        fromSym = dominant;
      }
    }

    const activeHolding = walletHoldingsRef.current[fromSym];
    const activeTradable = getTradableInfo(fromSym, activeHolding, tokensRef.current[fromSym]?.usdPrice || 0);
    if (!activeTradable.isTradable) {
      soundEngine.playAlertChime("low");
      setLastActionMessage("⚠️ No se detecta saldo comercial disponible en la sub-wallet (SOL reservado para gas).");
      return;
    }

    const validTargets = curRanking.filter((t) => t.symbol !== fromSym);
    if (validTargets.length === 0) return;

    let bestCandidate: CryptoSymbol | null = null;
    let highestGain = -Infinity;

    for (const candidate of validTargets) {
      const metrics = calculateSwapMetrics(fromSym, candidate.symbol);
      if (metrics && metrics.netGainPercent > highestGain) {
        highestGain = metrics.netGainPercent;
        bestCandidate = candidate.symbol;
      }
    }

    if (!bestCandidate && validTargets.length > 0) {
      bestCandidate = validTargets[0].symbol;
    }

    if (bestCandidate) {
      setLastActionMessage(`⚡ Disparando swap automático inmediato: ${fromSym} ➔ ${bestCandidate}...`);
      await handleRotationSwap(fromSym, bestCandidate, true);
    }
  }, [calculateSwapMetrics, handleRotationSwap]);

  // Automated Rebalancing Loop: When Auto Bot is active, periodically evaluate and trigger profitable swaps
  useEffect(() => {
    if (!strategyState.autoBotEnabled) return;

    // Verificar si la tenencia actual tiene saldo comerciable real
    const currentHeldInfo = getTradableInfo(
      strategyState.currentHoldingToken,
      walletHoldingsRef.current[strategyState.currentHoldingToken],
      tokens[strategyState.currentHoldingToken]?.usdPrice || 0
    );

    if (!currentHeldInfo.isTradable) {
      let dominantToken: CryptoSymbol | null = null;
      let maxUsd = -1;
      for (const sym of ["ZEC", "BTC", "ETH", "JUP", "USDC", "SOL"] as CryptoSymbol[]) {
        const info = getTradableInfo(sym, walletHoldingsRef.current[sym], tokens[sym]?.usdPrice || 0);
        if (info.isTradable && info.tradableUsd > maxUsd) {
          maxUsd = info.tradableUsd;
          dominantToken = sym;
        }
      }

      if (dominantToken) {
        const domHolding = walletHoldingsRef.current[dominantToken];
        const domBal = dominantToken === "SOL"
          ? Math.max(0.0001, Number(((domHolding?.balance || 0) - 0.0035).toFixed(5)))
          : (domHolding?.balance || 0);

        setStrategyState((prev) => ({
          ...prev,
          initialBuyDone: true,
          currentHoldingToken: dominantToken!,
          currentHoldingAmount: domBal,
        }));
        setSelectedSourceToken(dominantToken);
        setSelectedTargetToken(null);
        setManualHoldingInput(String(domBal));
      } else {
        if (walletSolBalance > 0.005) {
          const holdingAmount = Math.max(0.0001, Number((walletSolBalance - 0.0035).toFixed(5)));
          setStrategyState((prev) => ({
            ...prev,
            initialBuyDone: true,
            currentHoldingToken: "SOL",
            currentHoldingAmount: holdingAmount,
          }));
        } else if (!strategyState.initialBuyDone && !isExecutingRef.current) {
          handleInitialBuy();
        }
        return;
      }
    }

    const checkAndExecuteAutoSwap = () => {
      if (isExecutingRef.current) return;
      const curState = strategyStateRef.current;
      const curRanking = rankingRef.current;

      // Determinar activo de origen garantizando que tenga capital comerciable real:
      let fromSym = curState.currentHoldingToken || "SOL";
      const curTradable = getTradableInfo(fromSym, walletHoldingsRef.current[fromSym], tokensRef.current[fromSym]?.usdPrice || 0);

      if (!curTradable.isTradable) {
        let dominant: CryptoSymbol | null = null;
        let maxUsd = -1;
        for (const sym of ["ZEC", "BTC", "ETH", "JUP", "USDC", "SOL"] as CryptoSymbol[]) {
          const info = getTradableInfo(sym, walletHoldingsRef.current[sym], tokensRef.current[sym]?.usdPrice || 0);
          if (info.isTradable && info.tradableUsd > maxUsd) {
            maxUsd = info.tradableUsd;
            dominant = sym;
          }
        }
        if (dominant) {
          fromSym = dominant;
        }
      }

      const activeHolding = walletHoldingsRef.current[fromSym];
      const activeTradable = getTradableInfo(fromSym, activeHolding, tokensRef.current[fromSym]?.usdPrice || 0);
      if (!activeTradable.isTradable) {
        return;
      }

      const validTargets = curRanking.filter((t) => t.symbol !== fromSym);
      if (validTargets.length === 0) return;

      // Evaluar todos los candidatos de rotación para registrar la mejor opción
      let bestCandidate: CryptoSymbol | null = null;
      let highestGain = -Infinity;

      for (const candidate of validTargets) {
        const metrics = calculateSwapMetrics(fromSym, candidate.symbol);
        if (metrics && metrics.netGainPercent > highestGain) {
          highestGain = metrics.netGainPercent;
          bestCandidate = candidate.symbol;
        }
      }

      if (!bestCandidate && validTargets.length > 0) {
        bestCandidate = validTargets[0].symbol;
      }

      const threshold = curState.minNetGainThreshold ?? 0.1;
      const shouldTrigger = bestCandidate && highestGain >= threshold;

      setAutoBotStatus({
        bestCandidate,
        currentGain: highestGain > -999 ? highestGain : 0,
        threshold,
        lastScanTime: Date.now(),
        isTriggering: !!shouldTrigger,
      });

      if (shouldTrigger && bestCandidate) {
        console.log(`[AutoBot] Oportunidad rentable detectada: ${fromSym} -> ${bestCandidate} (+${highestGain.toFixed(2)}% neto >= +${threshold.toFixed(2)}%). Ejecutando swap on-chain...`);
        handleRotationSwap(fromSym, bestCandidate, true);
      }
    };

    // Evaluar de inmediato en cada actualización de precio o montaje
    checkAndExecuteAutoSwap();

    // Mantener intervalo de escaneo ultrarrápido a la frecuencia configurada (100ms default)
    const scanMs = Math.max(50, strategyState.scanFrequencyMs ?? 100);
    const timer = setInterval(checkAndExecuteAutoSwap, scanMs);

    return () => clearInterval(timer);
  }, [
    strategyState.autoBotEnabled,
    strategyState.initialBuyDone,
    strategyState.currentHoldingAmount,
    strategyState.scanFrequencyMs,
    strategyState.minNetGainThreshold,
    walletSolBalance,
    tokens,
  ]);

  // Current value of held asset
  const currentHeldTokenData = tokens[strategyState.currentHoldingToken];
  const currentPortfolioValueUsd = strategyState.currentHoldingAmount > 0 && currentHeldTokenData
    ? strategyState.currentHoldingAmount * currentHeldTokenData.usdPrice
    : initialCapitalUsd;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 lg:p-6 space-y-5 shadow-2xl">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <RotateCw className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white tracking-wide">
              {t("strategyTitle")}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono">
              ALGO-ROTATION
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {t("strategySubtitle")}
          </p>
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
              <span className="font-mono">
                {walletConfig?.isConnected && walletConfig.address
                  ? `Wallet: ${walletConfig.address.substring(0, 4)}...${walletConfig.address.substring(walletConfig.address.length - 4)}`
                  : botKeypair?.publicKey
                  ? `Wallet: ${botKeypair.publicKey.substring(0, 4)}...${botKeypair.publicKey.substring(botKeypair.publicKey.length - 4)}`
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

          {/* Auto Bot Toggle with Live Status */}
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <Bot className={`w-4 h-4 ${strategyState.autoBotEnabled ? "text-emerald-400 animate-pulse" : "text-slate-500"}`} />
            <div className="text-[11px]">
              <span className="text-slate-400 block leading-tight">{t("rebalanceBot")}</span>
              <span className={`font-bold ${strategyState.autoBotEnabled ? "text-emerald-400" : "text-slate-400"}`}>
                {strategyState.autoBotEnabled ? t("botActiveAuto") : t("botManual")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextState = !strategyState.autoBotEnabled;
                if (nextState && onResetBaseline) {
                  onResetBaseline();
                }
                setStrategyState((prev) => ({
                  ...prev,
                  autoBotEnabled: nextState,
                }));
                soundEngine.playAlertChime(nextState ? "high" : "low");
              }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                strategyState.autoBotEnabled ? "bg-emerald-600" : "bg-slate-700"
              }`}
              title="Alternar entre modo manual y bot de rebalanceo automático"
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

      {/* Auto Bot Active Notification Bar */}
      {strategyState.autoBotEnabled && (
        <div className="bg-emerald-950/40 border border-emerald-700/60 rounded-lg p-3.5 flex flex-col gap-3 text-xs text-emerald-300 shadow-lg shadow-emerald-950/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-emerald-800/40 pb-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-semibold text-emerald-200">
                🤖 Bot Autónomo Activo en Solana Mainnet
              </span>
              <span className="font-mono text-[11px] bg-emerald-900/80 px-2 py-0.5 rounded text-emerald-200 border border-emerald-600/40">
                ⚡ Escaneo: {strategyState.scanFrequencyMs ?? 100}ms | Umbral: +{(strategyState.minNetGainThreshold ?? 0.1).toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="text-slate-400">
                Wallet: <strong className="text-emerald-400">{walletSolBalance.toFixed(4)} SOL</strong>
              </span>
              <span className="bg-emerald-900/80 px-2.5 py-0.5 rounded font-bold text-emerald-100 border border-emerald-500/30">
                {strategyState.totalSwapsCount} swaps ejecutados
              </span>
            </div>
          </div>

          {/* Quick Frequency & Sensitivity Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-slate-950/80 p-2.5 rounded border border-emerald-900/60 text-[11px]">
            {/* Frequency Selection */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-slate-300 font-medium">
                <span className="flex items-center gap-1 text-emerald-400">
                  <Zap className="w-3.5 h-3.5" />
                  Velocidad de Reacción (Escaneo):
                </span>
                <span className="font-mono font-bold text-cyan-300">
                  {strategyState.scanFrequencyMs ?? 100}ms {((strategyState.scanFrequencyMs ?? 100) <= 100) ? "(0.1s Ultra-Rápido)" : ""}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {[
                  { ms: 100, label: "⚡ 100ms (0.1s)" },
                  { ms: 250, label: "🚀 250ms" },
                  { ms: 500, label: "⏱️ 500ms" },
                  { ms: 1000, label: "🐢 1.0s" },
                ].map((item) => (
                  <button
                    key={item.ms}
                    type="button"
                    onClick={() => {
                      setStrategyState((prev) => ({ ...prev, scanFrequencyMs: item.ms }));
                      soundEngine.playAlertChime("high");
                    }}
                    className={`flex-1 py-1 rounded text-[10px] font-mono transition-colors ${
                      (strategyState.scanFrequencyMs ?? 100) === item.ms
                        ? "bg-cyan-500 text-slate-950 font-bold shadow-sm"
                        : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Threshold Selection */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-slate-300 font-medium">
                <span className="text-emerald-400">Umbral Ganancia Neta:</span>
                <span className="font-mono font-bold text-emerald-300">
                  +{(strategyState.minNetGainThreshold ?? 0.1).toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center gap-1">
                {[
                  { th: 0.0, label: "0.0% (Inmediato)" },
                  { th: 0.05, label: "+0.05%" },
                  { th: 0.1, label: "+0.10%" },
                  { th: 0.2, label: "+0.20%" },
                  { th: 0.3, label: "+0.30%" },
                ].map((item) => (
                  <button
                    key={item.th}
                    type="button"
                    onClick={() => {
                      setStrategyState((prev) => ({ ...prev, minNetGainThreshold: item.th }));
                      soundEngine.playAlertChime("high");
                    }}
                    className={`flex-1 py-1 rounded text-[10px] font-mono transition-colors ${
                      (strategyState.minNetGainThreshold ?? 0.1) === item.th
                        ? "bg-emerald-500 text-slate-950 font-bold shadow-sm"
                        : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live Monitor and Instant Swap Trigger */}
          <div className="bg-slate-950/90 rounded p-2.5 border border-emerald-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 text-[11px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400 font-semibold">Monitor en Vivo:</span>
              {autoBotStatus.bestCandidate ? (
                <span>
                  Evaluando: <strong className="text-cyan-300">{strategyState.currentHoldingToken || "SOL"} ➔ {autoBotStatus.bestCandidate}</strong> (Ganancia neta: <strong className={autoBotStatus.currentGain >= (strategyState.minNetGainThreshold ?? 0.1) ? "text-emerald-400 font-bold" : "text-amber-400 font-mono"}>{autoBotStatus.currentGain >= 0 ? "+" : ""}{autoBotStatus.currentGain.toFixed(2)}%</strong> vs Umbral: <span className="text-emerald-300 font-mono">+{(strategyState.minNetGainThreshold ?? 0.1).toFixed(2)}%</span>).
                  {autoBotStatus.currentGain >= (strategyState.minNetGainThreshold ?? 0.1)
                    ? " 🚀 ¡Condición satisfecha! Transmitiendo swap on-chain..."
                    : ` Esperando +${(strategyState.minNetGainThreshold ?? 0.1).toFixed(2)}% para rotar automáticamente.`}
                </span>
              ) : (
                <span className="text-slate-400">Escaneando precios en tiempo real...</span>
              )}
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <button
                type="button"
                onClick={executeAutoSwapNow}
                disabled={isExecuting}
                className="w-full md:w-auto px-3 py-1.5 rounded bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/50 cursor-pointer transition-all disabled:opacity-50 whitespace-nowrap"
                title="Ejecutar el swap automático en este instante hacia el token óptimo"
              >
                <Zap className="w-3.5 h-3.5 fill-current text-yellow-300" />
                <span>⚡ Disparar Swap Automático Ahora</span>
              </button>
            </div>
          </div>

          {/* Technical Note on Latency */}
          <div className="text-[10px] text-slate-400 bg-slate-900/60 rounded px-2.5 py-1.5 border border-slate-800 flex items-start gap-1.5">
            <span className="text-cyan-400 font-bold whitespace-nowrap">ℹ️ Latencia de Red:</span>
            <span>
              Un tiempo de reacción de <strong>0.1ms (100 microsegundos)</strong> es físicamente inviable a través de Internet porque la latencia de ida y vuelta (ping RTT) de los paquetes hacia los servidores de Solana y Jupiter DEX requiere entre <strong>50ms y 120ms</strong>, y cada bloque de Solana se genera cada <strong>400ms</strong>. El intervalo de <strong>100ms (0.1 segundos)</strong> con evaluación reactiva instantánea ante cada actualización de precio ofrece la velocidad física máxima absoluta sin saturar la red ni bloquear el navegador.
            </span>
          </div>
        </div>
      )}

      {/* Explainer Accordion Box */}
      {showExplainer && (
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs space-y-2 text-slate-300">
          <h4 className="font-bold text-cyan-400 text-sm">{t("strategyExplainerTitle")}</h4>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
            <li>{t("strategyStep1")}</li>
            <li>{t("strategyStep2")}</li>
            <li>{t("strategyStep3")}</li>
            <li>{t("strategyStep4")}</li>
          </ol>
        </div>
      )}

      {/* 5-Token Live Performance Ranking Strip */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              {t("rankingTitle")}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 font-mono">
              Base: {botExecutionLaunchedAt ? new Date(botExecutionLaunchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Inicial"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onResetBaseline?.()}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 border border-slate-700 hover:border-cyan-500/40 text-[11px] font-mono transition-colors cursor-pointer"
              title="Reiniciar punto de referencia de ejecución con los precios actuales"
            >
              <RotateCw className="w-3 h-3 text-cyan-400" />
              <span>Fijar Base Actual</span>
            </button>
            <span className="text-[11px] text-slate-400 font-mono">
              Spread Ejecución: <strong className="text-cyan-400 font-bold">+{spreadPercent.toFixed(2)}%</strong>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {ranking.map((item) => {
            const isHolding = strategyState.currentHoldingToken === item.symbol;
            const isExecGain = item.changeSinceExecution >= 0;
            const is24hGain = item.changePercent24h >= 0;

            return (
              <div
                key={item.symbol}
                className={`p-3 rounded-lg border transition-all ${
                  isHolding
                    ? "bg-slate-800/90 border-cyan-500/80 shadow-md shadow-cyan-950/40 ring-1 ring-cyan-500/30"
                    : item.isHighest
                    ? "bg-emerald-950/20 border-emerald-800/40"
                    : item.isLowest
                    ? "bg-rose-950/20 border-rose-800/40"
                    : "bg-slate-950/60 border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between mb-1 text-[11px]">
                  <span className="font-mono text-slate-400">#{item.rank}</span>
                  {isHolding && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      En Portafolio
                    </span>
                  )}
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

                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-base font-bold text-white">{item.symbol}</span>
                  <span className="font-mono text-slate-200 text-xs font-semibold">
                    ${item.usdPrice.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: item.usdPrice > 100 ? 2 : 4,
                    })}
                  </span>
                </div>

                {/* Porcentaje de Cambio desde Ejecución (El que rige la decisión del bot) */}
                <div className={`p-1.5 rounded border text-[11px] font-mono font-bold flex items-center justify-between ${
                  isExecGain
                    ? "bg-emerald-950/60 border-emerald-700/50 text-emerald-300"
                    : "bg-rose-950/60 border-rose-700/50 text-rose-300"
                }`}>
                  <span className="text-[9px] uppercase tracking-wide opacity-80 font-sans">Δ Ejecución:</span>
                  <div className="flex items-center gap-0.5">
                    {isExecGain ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    <span>{item.changeSinceExecution >= 0 ? "+" : ""}{item.changeSinceExecution.toFixed(2)}%</span>
                  </div>
                </div>

                {/* Métricas secundarias: 24h y Precio Base fijado */}
                <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 flex flex-col gap-0.5 text-[10px] text-slate-400 font-mono">
                  <div className="flex items-center justify-between">
                    <span>Var. 24h:</span>
                    <span className={is24hGain ? "text-emerald-400" : "text-amber-400"}>
                      {item.changePercent24h >= 0 ? "+" : ""}{item.changePercent24h.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Base Ejec.:</span>
                    <span>
                      ${item.baselinePrice.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: item.baselinePrice > 100 ? 2 : 4,
                      })}
                    </span>
                  </div>
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
        onKeypairLoaded={setBotKeypair}
        onUpdateWalletConfig={onUpdateWalletConfig}
        onBalanceUpdated={setWalletSolBalance}
        walletConfig={walletConfig}
      />

      {/* Main Execution Strategy Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (5 cols): Portfolio Status & Capital Control */}
        <div className="lg:col-span-5 bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Estado del Portafolio
            </h4>
            <span className="text-[11px] font-mono text-slate-400">
              {strategyState.initialBuyDone ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> {t("activePosition")}
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <Info className="w-3 h-3" /> {t("pendingBuy")}
                </span>
              )}
            </span>
          </div>

          {/* Saldo Real en Wallet Solana (Referencia directa de capital) */}
          <div className="bg-slate-900/90 p-3 rounded-lg border border-cyan-800/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium block">
                  Saldo en Wallet (Solana Mainnet)
                </span>
                <span className="text-xs font-mono font-bold text-white">
                  {isLoadingWalletBal ? "Consultando..." : `${walletSolBalance.toFixed(4)} SOL`}
                  <span className="text-slate-400 font-normal ml-1 text-[11px]">
                    (~${(walletSolBalance * (tokens.SOL?.usdPrice || 101.14)).toFixed(2)} USD)
                  </span>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSyncWithWallet}
              className="px-2.5 py-1 rounded text-[10px] font-bold font-mono bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors shadow-sm cursor-pointer"
              title="Sincronizar el capital y la tenencia con el saldo exacto en tu wallet"
            >
              ⚡ Usar Saldo Wallet
            </button>
          </div>

          {/* Configuración del Capital Asignado */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-slate-300 font-medium">{t("totalCapitalAmount")}</span>
              <div className="text-right">
                <span className="font-bold text-white font-mono text-sm">${initialCapitalUsd.toFixed(2)} USD</span>
                <span className="block text-[10px] font-mono text-cyan-400">
                  ≈ {(initialCapitalUsd / (tokens[strategyState.currentHoldingToken]?.usdPrice || 1)).toFixed(tokens[strategyState.currentHoldingToken]?.usdPrice > 100 ? 5 : 4)} {strategyState.currentHoldingToken}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">$</span>
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={initialCapitalUsd}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0) {
                      handleUpdateCapital(val);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 pl-6 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  placeholder="19.72"
                />
              </div>

              <div className="flex gap-1">
                {[20, 50, 100, 250, 500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handleUpdateCapital(amt)}
                    className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                      Math.round(initialCapitalUsd) === amt
                        ? "bg-cyan-500 text-slate-950 font-bold"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* LISTADO DE TENENCIAS EN PORTAFOLIO Y SELECCIÓN PARA TRADE AUTOMÁTICO */}
          <div className="pt-3 border-t border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-slate-200 font-bold text-xs">Tenencias de Tokens en Portafolio</span>
              </div>
              <button
                type="button"
                onClick={() => refreshHoldings()}
                disabled={isLoadingHoldings}
                className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 font-mono bg-slate-900 hover:bg-slate-800 px-2 py-0.5 rounded border border-slate-700 transition-colors cursor-pointer"
                title="Consultar saldos reales en la blockchain"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingHoldings ? "animate-spin" : ""}`} />
                <span>{isLoadingHoldings ? "Actualizando..." : "Actualizar"}</span>
              </button>
            </div>

            {/* Listado de Tokens con Saldo Real en la Blockchain */}
            <div className="space-y-1.5">
              {(["SOL", "BTC", "ETH", "JUP", "USDC", "ZEC"] as CryptoSymbol[]).map((sym) => {
                const isSelected = strategyState.currentHoldingToken === sym;
                const holding = walletHoldings[sym] || { balance: 0, rawAmount: "0", usdValue: 0 };
                const tokenPrice = tokens[sym]?.usdPrice ?? 0;
                const hasBalance = holding.balance > 0;

                return (
                  <div
                    key={sym}
                    onClick={() => handleSelectHoldingForTrade(sym)}
                    className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? "bg-cyan-950/40 border-cyan-400 shadow-md shadow-cyan-950/40 ring-1 ring-cyan-500/30"
                        : hasBalance
                        ? "bg-slate-900/90 border-slate-700 hover:border-slate-600"
                        : "bg-slate-900/40 border-slate-800/80 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] font-mono border ${
                        isSelected
                          ? "bg-cyan-500 text-slate-950 border-cyan-300"
                          : hasBalance
                          ? "bg-slate-800 text-cyan-300 border-slate-600"
                          : "bg-slate-800/50 text-slate-500 border-slate-700"
                      }`}>
                        {sym === "SOL" ? "◎" : sym === "BTC" ? "₿" : sym === "ETH" ? "Ξ" : sym === "JUP" ? "♃" : sym === "USDC" ? "$" : "ⓩ"}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-xs font-mono">{sym}</span>
                          {isSelected && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold">
                              Trade Activo
                            </span>
                          )}
                          {hasBalance && !isSelected && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                              Con Saldo
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          ${tokenPrice > 100 ? tokenPrice.toLocaleString("en-US", { maximumFractionDigits: 2 }) : tokenPrice.toFixed(4)} USD
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono text-xs font-bold text-slate-100">
                        {holding.balance > 0 ? (
                          holding.balance.toLocaleString("en-US", {
                            maximumFractionDigits: sym === "SOL" ? 4 : sym === "USDC" ? 2 : sym === "JUP" ? 2 : sym === "ZEC" ? 6 : 8,
                          })
                        ) : (
                          "0.00"
                        )}{" "}
                        <span className="text-[10px] text-slate-400">{sym}</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        ≈ ${holding.usdValue.toFixed(2)} USD
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Configuración de Cantidad a utilizar para el Trade Automático */}
            <div className="p-3 bg-slate-900/90 rounded-lg border border-cyan-800/40 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">
                  Cantidad de <strong className="text-cyan-300">{strategyState.currentHoldingToken}</strong> para Auto-Trade:
                </span>
                <span className="font-mono text-cyan-400 font-bold">
                  {strategyState.currentHoldingAmount} {strategyState.currentHoldingToken}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={manualHoldingInput !== "" ? manualHoldingInput : strategyState.currentHoldingAmount}
                    onChange={(e) => {
                      const str = e.target.value.replace(",", ".");
                      setManualHoldingInput(str);
                      const parsed = parseFloat(str);
                      if (!isNaN(parsed) && parsed >= 0) {
                        handleUpdateHolding(parsed, strategyState.currentHoldingToken);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                    placeholder="0.00"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                    {strategyState.currentHoldingToken}
                  </span>
                </div>

                {/* Atajos rápidos de porcentaje */}
                <div className="flex gap-1">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        const tokenSym = strategyState.currentHoldingToken;
                        const holding = walletHoldings[tokenSym];
                        let maxBal = holding && holding.balance > 0 ? holding.balance : (
                          strategyState.currentHoldingAmount > 0
                            ? strategyState.currentHoldingAmount
                            : initialCapitalUsd / (tokens[tokenSym]?.usdPrice || 1)
                        );
                        if (tokenSym === "SOL" && holding && holding.balance > 0) {
                          maxBal = Math.max(0.0001, holding.balance - 0.0035);
                        }
                        let portion = Number(((maxBal * pct) / 100).toFixed(tokens[tokenSym]?.usdPrice > 100 ? 5 : 4));
                        if (pct === 100) portion = Number(maxBal.toFixed(tokenSym === "SOL" ? 5 : 4));
                        setManualHoldingInput(String(portion));
                        handleUpdateHolding(portion, tokenSym);
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[10px] font-mono transition-colors cursor-pointer"
                    >
                      {pct === 100 ? "MAX" : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-1 text-[11px] text-slate-400 font-mono">
                <span>{t("portfolioValueDex")}:</span>
                <span className="font-bold text-cyan-400 font-mono text-xs">
                  ${currentPortfolioValueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
              </div>
            </div>
          </div>

          {/* Configuración del Umbral Mínimo de Aumento Neto tras costes */}
          <div className="pt-3 border-t border-slate-800/80 space-y-2">
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-slate-300 font-medium">{t("minNetGainLabel")}</span>
              <span className="font-bold text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                +{(strategyState.minNetGainThreshold ?? 0.1).toFixed(2)}%
              </span>
            </div>

            {/* Selector rápido de umbral neto */}
            <div className="flex items-center gap-1">
              {[0.0, 0.05, 0.1, 0.2, 0.3, 0.5].map((th) => (
                <button
                  key={th}
                  type="button"
                  onClick={() =>
                    setStrategyState((prev) => ({
                      ...prev,
                      minNetGainThreshold: th,
                    }))
                  }
                  className={`flex-1 py-1 rounded text-[10px] font-mono transition-colors ${
                    (strategyState.minNetGainThreshold ?? 0.1) === th
                      ? "bg-emerald-500 text-slate-950 font-bold"
                      : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                  }`}
                >
                  {th === 0 ? "0.0%" : `+${th}%`}
                </button>
              ))}
            </div>

            {/* Frecuencia de Escaneo / Tiempo de Reacción */}
            <div className="pt-1 flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-slate-400 text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-1">
                  <Zap className="w-3 h-3 text-cyan-400" />
                  Velocidad de Reacción (Escaneo):
                </span>
                <span className="font-bold text-cyan-400 font-mono">
                  {strategyState.scanFrequencyMs ?? 100}ms
                </span>
              </div>
              <div className="flex items-center gap-1">
                {[
                  { ms: 100, label: "⚡ 100ms (0.1s)" },
                  { ms: 250, label: "🚀 250ms" },
                  { ms: 500, label: "⏱️ 500ms" },
                  { ms: 1000, label: "🐢 1.0s" },
                ].map((item) => (
                  <button
                    key={item.ms}
                    type="button"
                    onClick={() =>
                      setStrategyState((prev) => ({
                        ...prev,
                        scanFrequencyMs: item.ms,
                      }))
                    }
                    className={`flex-1 py-1 rounded text-[10px] font-mono transition-colors ${
                      (strategyState.scanFrequencyMs ?? 100) === item.ms
                        ? "bg-cyan-500 text-slate-950 font-bold"
                        : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cost Settings Accordion con Tarifa de Gas Inmutable */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowCostSettings(!showCostSettings)}
                className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Sliders className="w-3 h-3" />
                <span>{showCostSettings ? "Ocultar Parámetros de Costes" : t("costSettingsBtn")}</span>
              </button>

              {showCostSettings && (
                <div className="mt-2 p-2.5 bg-slate-900 rounded border border-slate-800 space-y-2.5 text-[11px]">
                  {/* Tarifa de Gas Inmutable en 0.000005 SOL */}
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                    <div className="flex flex-col">
                      <span className="text-slate-300 font-medium flex items-center gap-1">
                        <Lock className="w-3 h-3 text-cyan-400" />
                        Tarifa de Gas Solana
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">
                        Inmutable: 5,000 Lamports por tx en Solana Mainnet
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono font-bold text-xs border border-cyan-800/50">
                        0.000005 SOL
                      </span>
                      <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                        (~${(SOLANA_IMMUTABLE_GAS_FEE_SOL * (tokens.SOL?.usdPrice || 101.14)).toFixed(6)} USD)
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-slate-300 block">{t("dexFeeLabel")}</span>
                      <span className="text-[9px] text-slate-500">Jupiter Aggregator DEX</span>
                    </div>
                    <span className="font-mono text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                      0.00% (Sin comisión)
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t("slippageLabel")}</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="2.0"
                        value={strategyState.slippagePercent}
                        onChange={(e) =>
                          setStrategyState((prev) => ({
                            ...prev,
                            slippagePercent: parseFloat(e.target.value) || 0.05,
                          }))
                        }
                        className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono text-right text-xs"
                      />
                      <span className="text-slate-500 text-xs font-mono">%</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t("minNetGainLabel")}</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.05"
                        min="0.05"
                        max="10.0"
                        value={strategyState.minNetGainThreshold}
                        onChange={(e) =>
                          setStrategyState((prev) => ({
                            ...prev,
                            minNetGainThreshold: parseFloat(e.target.value) || 0.3,
                          }))
                        }
                        className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono text-right text-xs"
                      />
                      <span className="text-slate-500 text-xs font-mono">%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Botón Compra Inicial (Paso 1) */}
          {!strategyState.initialBuyDone && cheapestToken && (
            <button
              onClick={handleInitialBuy}
              disabled={isExecuting}
              className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50 transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                {t("step1InitialBuyBtn")} ({cheapestToken.symbol} {cheapestToken.changeSinceExecution >= 0 ? "+" : ""}{cheapestToken.changeSinceExecution.toFixed(2)}% | 24h: {cheapestToken.changePercent24h >= 0 ? "+" : ""}{cheapestToken.changePercent24h.toFixed(2)}%)
              </span>
            </button>
          )}
        </div>

        {/* Right Column (7 cols): Interactive Swap Route, Manual Amount Config & Profitability Guard */}
        <div className="lg:col-span-7 bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
              {t("step2ProjectionTitle")}
            </h4>
            <span className="text-[11px] font-mono text-cyan-400">
              {strategyState.totalSwapsCount} swaps ejecutados
            </span>
          </div>

          {/* Swap Route Card */}
          <div className="bg-slate-900/90 p-3.5 rounded-lg border border-slate-800 space-y-3">
            <div className="grid grid-cols-11 items-center gap-2 text-center text-xs">
              {/* Source Token (Origen / Venta) */}
              <div className="col-span-5 bg-slate-950 p-2.5 rounded-lg border border-emerald-900/40 text-left">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-400 block font-semibold">
                    {t("sourceSell")}
                  </span>
                  {(walletHoldings[activeSwapFrom]?.balance || 0) > 0.000001 ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40 font-mono">
                      En posesión: {(walletHoldings[activeSwapFrom]?.balance || 0).toFixed(activeSwapFrom === "SOL" ? 4 : 5)} {activeSwapFrom}
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/40 font-mono">
                      Sin saldo en sub-wallet
                    </span>
                  )}
                </div>

                <select
                  value={activeSwapFrom}
                  onChange={(e) => {
                    const newSource = e.target.value as CryptoSymbol;
                    setSelectedSourceToken(newSource);
                    if (activeSwapTo === newSource) {
                      setSelectedTargetToken(null);
                    }
                    handleSelectHoldingForTrade(newSource);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 text-white font-bold text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  {Object.keys(tokens).map((symKey) => {
                    const sym = symKey as CryptoSymbol;
                    const h = walletHoldings[sym];
                    const hasBal = h && h.balance > 0.000001;
                    const base = baselinePrices?.[sym] || tokens[sym]?.usdPrice || 1;
                    const execChange = base > 0 ? ((tokens[sym]?.usdPrice - base) / base) * 100 : 0;
                    return (
                      <option key={sym} value={sym}>
                        {sym} {hasBal ? `(Saldo: ${h.balance.toFixed(sym === "SOL" ? 4 : sym === "ZEC" ? 5 : 6)} | $${h.usdValue.toFixed(2)} USD)` : "(Sin saldo)"} — Δ Ejec: {execChange >= 0 ? "+" : ""}{execChange.toFixed(1)}%
                      </option>
                    );
                  })}
                </select>

                {/* Acceso rápido a tokens que sí tienen saldo en la sub-wallet */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                  <span className="text-slate-400 font-mono text-[9px]">Saldo wallet:</span>
                  {(["SOL", "BTC", "ETH", "JUP", "USDC", "ZEC"] as CryptoSymbol[]).map((s) => {
                    const bal = walletHoldings[s]?.balance || 0;
                    const isCur = activeSwapFrom === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setSelectedSourceToken(s);
                          if (activeSwapTo === s) setSelectedTargetToken(null);
                          handleSelectHoldingForTrade(s);
                        }}
                        className={`px-1.5 py-0.5 rounded font-mono text-[9px] border transition-all ${
                          isCur
                            ? "bg-cyan-500 text-slate-950 border-cyan-300 font-bold"
                            : bal > 0
                            ? "bg-slate-800 text-emerald-300 border-emerald-700/60 hover:bg-slate-700 font-medium"
                            : "bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-400"
                        }`}
                      >
                        {s} {bal > 0 ? `(${bal.toFixed(s === "SOL" ? 3 : 4)})` : "(0)"}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-0.5 mt-2 text-[10px] font-mono">
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">Precio:</span>
                    <span>${(tokens[activeSwapFrom]?.usdPrice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Δ Ejecución:</span>
                    <span className={(activeMetrics?.fromChangeSinceExecution ?? 0) >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                      {(activeMetrics?.fromChangeSinceExecution ?? 0) >= 0 ? "+" : ""}
                      {(activeMetrics?.fromChangeSinceExecution ?? 0).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>24h:</span>
                    <span className={(tokens[activeSwapFrom]?.priceChange24h ?? 0) >= 0 ? "text-emerald-400/80" : "text-amber-400/80"}>
                      {(tokens[activeSwapFrom]?.priceChange24h ?? 0) >= 0 ? "+" : ""}
                      {(tokens[activeSwapFrom]?.priceChange24h ?? 0).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Swap Icon */}
              <div className="col-span-1 flex justify-center text-cyan-400">
                <ArrowRight className="w-4 h-4" />
              </div>

              {/* Target Token (Destino / Compra) */}
              <div className="col-span-5 bg-slate-950 p-2.5 rounded-lg border border-rose-900/40 text-left">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-400 block font-semibold">
                    {t("targetBuy")}
                  </span>
                  {activeSwapTo === autoBestDestination.symbol ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40 font-mono">
                      Óptimo
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedTargetToken(null)}
                      className="text-[9px] text-cyan-400 hover:underline"
                    >
                      Auto
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
                  className="w-full bg-slate-900 border border-slate-700 text-white font-bold text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-rose-500 cursor-pointer"
                >
                  {Object.keys(tokens).map((symKey) => {
                    const sym = symKey as CryptoSymbol;
                    const isSource = sym === activeSwapFrom;
                    const isAuto = sym === autoBestDestination.symbol;
                    const base = baselinePrices?.[sym] || tokens[sym]?.usdPrice || 1;
                    const execChange = base > 0 ? ((tokens[sym]?.usdPrice - base) / base) * 100 : 0;
                    const change24 = tokens[sym]?.priceChange24h ?? 0;
                    return (
                      <option key={sym} value={sym} disabled={isSource}>
                        {sym} (Δ Ejec: {execChange >= 0 ? "+" : ""}{execChange.toFixed(1)}% | 24h: {change24 >= 0 ? "+" : ""}{change24.toFixed(1)}%)
                        {isSource ? " (Origen)" : isAuto ? " (Más Barata)" : ""}
                      </option>
                    );
                  })}
                </select>

                <div className="flex flex-col gap-0.5 mt-2 text-[10px] font-mono">
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">Precio:</span>
                    <span>${(tokens[activeSwapTo]?.usdPrice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Δ Ejecución:</span>
                    <span className={(activeMetrics?.toChangeSinceExecution ?? 0) >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                      {(activeMetrics?.toChangeSinceExecution ?? 0) >= 0 ? "+" : ""}
                      {(activeMetrics?.toChangeSinceExecution ?? 0).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>24h:</span>
                    <span className={(tokens[activeSwapTo]?.priceChange24h ?? 0) >= 0 ? "text-emerald-400/80" : "text-amber-400/80"}>
                      {(tokens[activeSwapTo]?.priceChange24h ?? 0) >= 0 ? "+" : ""}
                      {(tokens[activeSwapTo]?.priceChange24h ?? 0).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* SELECCIÓN Y CONFIGURACIÓN MANUAL DEL MONTO DEL SWAP ROTATIVO */}
            <div className="p-3 bg-slate-950 rounded-lg border border-cyan-900/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  Monto a rotar ({activeSwapFrom} ➔ {activeSwapTo}):
                </span>
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      setSwapAmountMode("TOKEN");
                      const tokenPrice = tokens[activeSwapFrom]?.usdPrice || 1;
                      const parsed = parseFloat(customSwapAmount);
                      if (!isNaN(parsed) && parsed > 0 && swapAmountMode === "USD") {
                        setCustomSwapAmount((parsed / tokenPrice).toFixed(tokenPrice > 100 ? 5 : 4));
                      }
                    }}
                    className={`px-2 py-0.5 rounded font-mono transition-colors ${
                      swapAmountMode === "TOKEN" ? "bg-cyan-500 text-slate-950 font-bold" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    En {activeSwapFrom}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSwapAmountMode("USD");
                      const tokenPrice = tokens[activeSwapFrom]?.usdPrice || 1;
                      const parsed = parseFloat(customSwapAmount);
                      if (!isNaN(parsed) && parsed > 0 && swapAmountMode === "TOKEN") {
                        setCustomSwapAmount((parsed * tokenPrice).toFixed(2));
                      }
                    }}
                    className={`px-2 py-0.5 rounded font-mono transition-colors ${
                      swapAmountMode === "USD" ? "bg-cyan-500 text-slate-950 font-bold" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    En USD ($)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={
                      customSwapAmount !== ""
                        ? customSwapAmount
                        : activeMetrics
                        ? swapAmountMode === "USD"
                          ? activeMetrics.currentTotalValueUsd.toFixed(2)
                          : activeMetrics.sourceAmount
                        : ""
                    }
                    onChange={(e) => handleTradeAmountChange(e.target.value)}
                    placeholder={
                      activeMetrics
                        ? swapAmountMode === "USD"
                          ? String(activeMetrics.currentTotalValueUsd.toFixed(2))
                          : String(activeMetrics.sourceAmount)
                        : "0.00"
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-white font-mono text-sm focus:outline-none focus:border-cyan-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                    {swapAmountMode === "USD" ? "USD" : activeSwapFrom}
                  </span>
                </div>

                {/* Accesos rápidos de porcentaje de tenencia */}
                <div className="flex items-center gap-1">
                  {[25, 50, 75, 100].map((pct) => {
                    const tokenPrice = tokens[activeSwapFrom]?.usdPrice || 1;
                    const holding = walletHoldings[activeSwapFrom];
                    let maxAmount = holding && holding.balance > 0 ? holding.balance : (
                      strategyState.currentHoldingAmount > 0 && strategyState.currentHoldingToken === activeSwapFrom
                        ? strategyState.currentHoldingAmount
                        : initialCapitalUsd / tokenPrice
                    );
                    if (activeSwapFrom === "SOL" && holding && holding.balance > 0) {
                      maxAmount = Math.max(0.0001, holding.balance - 0.0035);
                    }

                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          const portion = (maxAmount * pct) / 100;
                          const valStr = swapAmountMode === "USD"
                            ? (portion * tokenPrice).toFixed(2)
                            : (pct === 100 ? maxAmount.toFixed(activeSwapFrom === "SOL" ? 5 : tokenPrice > 100 ? 5 : 4) : portion.toFixed(activeSwapFrom === "SOL" ? 5 : tokenPrice > 100 ? 5 : 4));
                          handleTradeAmountChange(valStr);
                        }}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono transition-colors"
                      >
                        {pct === 100 ? "MAX" : `${pct}%`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Proyección instantánea del monto destino */}
              {activeMetrics && (
                <div className="flex items-center justify-between text-[11px] font-mono pt-1 text-slate-400">
                  <span>
                    Monto a vender: <strong className="text-white">{activeMetrics.sourceAmount} {activeSwapFrom}</strong> (~${activeMetrics.currentTotalValueUsd.toFixed(2)} USD)
                  </span>
                  <span>
                    Recibirás: <strong className="text-cyan-400 font-bold">~{activeMetrics.targetAmount} {activeSwapTo}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Aviso informativo si el origen ya es la moneda más barata del mercado */}
            {activeSwapFrom === overallCheapestToken.symbol && (
              <div className="bg-slate-950/70 p-2 rounded border border-slate-800 text-[11px] text-slate-400">
                <span>
                  💡 <strong className="text-white">{activeSwapFrom}</strong> es la moneda más barata del mercado. No se recomienda venderla ahora por <strong className="text-cyan-400">{activeSwapTo}</strong>.
                </span>
              </div>
            )}

            {/* DESGLOSE DETALLADO DE COSTES Y COMPROBACIÓN DEL UMBRAL DE GANANCIA NETA */}
            {activeMetrics && (
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1 font-medium">
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    Costos de la operación ({activeSwapFrom} ➔ {activeSwapTo}):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowFormulaModal(true)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold underline flex items-center gap-1"
                      title="Ver desglose de la fórmula matemática y auto-recarga de gas"
                    >
                      📐 Ver Fórmula Matemática
                    </button>
                    <span className="font-mono text-slate-200 font-bold">
                      ${activeMetrics.totalCostsUsd.toFixed(4)} USD
                    </span>
                  </div>
                </div>

                <div className={`grid grid-cols-2 ${activeMetrics.isSplToSpl ? "sm:grid-cols-5" : "sm:grid-cols-4"} gap-2 text-[11px]`}>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-slate-500 block">Gas Solana</span>
                      <span className="text-[9px] text-cyan-400 font-mono font-bold">INMUTABLE</span>
                    </div>
                    <span className="font-mono font-bold text-slate-200 text-[11px]">0.000005 SOL</span>
                    <span className="block text-[10px] text-slate-500 font-mono">
                      ~${activeMetrics.gasFeeUsd.toFixed(6)} USD
                    </span>
                  </div>

                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block">Jupiter DEX ({activeMetrics.dexFeePercent}%)</span>
                    <span className="font-mono font-bold text-emerald-400">0.00% (Sin costo)</span>
                    <span className="block text-[10px] text-slate-500 font-mono">$0.00 USD</span>
                  </div>

                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block">Deslizamiento ({activeMetrics.slippagePercent}%)</span>
                    <span className="font-mono font-bold text-slate-200">${activeMetrics.slippageUsd.toFixed(3)}</span>
                    <span className="block text-[10px] text-slate-500 font-mono">Protección MEV</span>
                  </div>

                  <div className="bg-slate-950 p-2 rounded border border-cyan-900/40 bg-cyan-950/20">
                    <span className="text-cyan-400 block font-medium">Tarifa creador ({activeMetrics.platformFeePercent}%)</span>
                    <span className="font-mono font-bold text-cyan-300">${activeMetrics.platformFeeUsd.toFixed(3)}</span>
                    <span className="block text-[10px] text-cyan-500/80 font-mono">Monetización bot</span>
                  </div>

                  {activeMetrics.isSplToSpl && (
                    <div className="bg-slate-950 p-2 rounded border border-purple-900/40 bg-purple-950/20 col-span-2 sm:col-span-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-purple-300 block font-medium">Auto-Recarga SOL</span>
                        <span className="text-[9px] text-purple-400 font-mono font-bold">SIMULTÁNEO</span>
                      </div>
                      <span className="font-mono font-bold text-purple-200">
                        {activeMetrics.neededRefuelSol > 0 ? `+${activeMetrics.neededRefuelSol.toFixed(4)} SOL` : "Cubierto"}
                      </span>
                      <span className="block text-[10px] text-purple-400/80 font-mono">
                        {activeMetrics.neededRefuelSol > 0 ? `~${activeMetrics.gasRefuelUsd.toFixed(3)} USD (${activeSwapFrom}➔SOL)` : `${walletSolBalance.toFixed(4)} SOL OK`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Comprobación matemática auditada del umbral de ganancia neta */}
                <div className="bg-slate-950/90 p-3 rounded-lg border border-slate-800 text-[11px] font-mono space-y-1.5">
                  <div className="flex items-center justify-between text-slate-300 font-bold border-b border-slate-800/80 pb-1 font-sans text-xs">
                    <span className="flex items-center gap-1.5 text-cyan-300">
                      <Scale className="w-3.5 h-3.5" />
                      Comprobación del Umbral de Ganancia Neta
                    </span>
                    <span className={activeMetrics.isProfitable ? "text-emerald-400" : "text-amber-400"}>
                      {activeMetrics.isProfitable ? "✅ CONDICIÓN CUMPLIDA" : "⚠️ NO CUMPLE CONDICIÓN"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-slate-400">
                    <div>
                      <span className="text-slate-500 block text-[10px]">1. Spread Bruto de Precios:</span>
                      <strong className="text-white">+{activeMetrics.spread.toFixed(2)}%</strong>
                      <span className="text-slate-500 text-[10px] block">Δ {activeSwapFrom} - Δ {activeSwapTo}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">2. Impacto Total de Costos:</span>
                      <strong className="text-amber-400">
                        -{((activeMetrics.totalCostsUsd / (activeMetrics.currentTotalValueUsd || 1)) * 100).toFixed(2)}%
                      </strong>
                      <span className="text-slate-500 text-[10px] block">(${activeMetrics.totalCostsUsd.toFixed(3)} USD)</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">3. Ganancia Neta Resultante:</span>
                      <strong className={activeMetrics.netGainPercent >= 0 ? "text-emerald-400 text-sm" : "text-rose-400 text-sm"}>
                        {activeMetrics.netGainPercent >= 0 ? "+" : ""}{activeMetrics.netGainPercent.toFixed(2)}%
                      </strong>
                      <span className="text-slate-500 text-[10px] block">
                        ({activeMetrics.netGainUsd >= 0 ? "+" : ""}${activeMetrics.netGainUsd.toFixed(2)} USD)
                      </span>
                    </div>
                  </div>

                  <div className="pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                    <span>
                      Regla: Ganancia Neta (<strong>{activeMetrics.netGainPercent.toFixed(2)}%</strong>) ≥ Umbral Mínimo (<strong>+{activeMetrics.minNetGain.toFixed(2)}%</strong>)
                    </span>
                    <span className={activeMetrics.isProfitable ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                      {activeMetrics.isProfitable
                        ? `Aprobado (+${(activeMetrics.netGainPercent - activeMetrics.minNetGain).toFixed(2)}% de margen sobre umbral)`
                        : `Déficit: Falta ${(activeMetrics.minNetGain - activeMetrics.netGainPercent).toFixed(2)}% para autorizar swap`}
                    </span>
                  </div>
                </div>

                {/* Tarjeta de estado de ejecución del swap */}
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
                          <span>
                            {t("netGainExpected")} {activeMetrics.netGainPercent >= 0 ? "+" : ""}{activeMetrics.netGainPercent.toFixed(2)}% ({activeMetrics.netGainUsd >= 0 ? "+" : ""}${activeMetrics.netGainUsd.toFixed(2)} USD)
                          </span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-4 h-4 text-amber-400" />
                          <span>
                            {t("netGainExpected")} {activeMetrics.netGainPercent >= 0 ? "+" : ""}{activeMetrics.netGainPercent.toFixed(2)}% ({activeMetrics.netGainUsd >= 0 ? "+" : ""}${activeMetrics.netGainUsd.toFixed(2)} USD)
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Spread Δ Ejecución: +{activeMetrics.spread.toFixed(2)}% | Tarifa Gas: 0.000005 SOL | Mínimo requerido: +{activeMetrics.minNetGain.toFixed(2)}% neto
                    </p>
                  </div>

                  <span className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider self-start sm:self-center font-mono ${
                    activeMetrics.isProfitable
                      ? "bg-emerald-900/80 text-emerald-200 border border-emerald-500/40"
                      : "bg-amber-900/80 text-amber-200 border border-amber-500/40"
                  }`}>
                    {activeMetrics.isProfitable ? "Apto para Swap" : "No Rentable"}
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
            className={`w-full py-3 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
              activeSwapFrom === activeSwapTo
                ? "bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed"
                : activeMetrics?.isProfitable
                ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/50 ring-1 ring-emerald-400/50"
                : "bg-slate-800/90 hover:bg-slate-800 text-amber-300 border border-amber-800/60 opacity-80 cursor-not-allowed"
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>
              {activeSwapFrom === activeSwapTo
                ? `No puedes intercambiar el mismo token (${activeSwapFrom} ➔ ${activeSwapTo})`
                : activeMetrics?.isProfitable
                ? `${t("executeSwapNow")} ${activeSwapFrom} ➔ ${activeSwapTo} (${activeMetrics.netGainPercent >= 0 ? "+" : ""}${activeMetrics.netGainPercent.toFixed(2)}% neto)`
                : `Swap en Espera: Ganancia neta insuficiente (${activeMetrics?.netGainPercent !== undefined ? (activeMetrics.netGainPercent >= 0 ? "+" : "") + activeMetrics.netGainPercent.toFixed(2) + "%" : "0%"}) - Mínimo +${activeMetrics?.minNetGain.toFixed(2) ?? "0.30"}%`}
            </span>
          </button>

          {/* Opción para forzar el swap de manera manual e inmediata con fondos reales */}
          {!activeMetrics?.isProfitable && activeSwapFrom !== activeSwapTo && (
            <div className="pt-2 border-t border-slate-800/60 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => handleRotationSwap(activeSwapFrom, activeSwapTo, true)}
                disabled={isExecuting}
                className="w-full py-2.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 shadow-md transition-all cursor-pointer border border-amber-400/40"
                title="Ejecutar el swap inmediatamente on-chain con los fondos reales de la wallet, omitiendo la espera del umbral mínimo"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>
                  {isExecuting ? "Transmitiendo a Solana Mainnet..." : `⚡ Forzar Swap Manual Ahora (${activeSwapFrom} ➔ ${activeSwapTo})`}
                </span>
              </button>
              <div className="flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-400 px-1 gap-1">
                <span>
                  💳 Saldo detectado en sub-wallet: <strong className="font-mono text-emerald-400 font-bold">{walletSolBalance.toFixed(4)} SOL</strong>
                </span>
                <span>
                  O selecciona el umbral <button type="button" onClick={() => setStrategyState(prev => ({ ...prev, minNetGainThreshold: 0.1 }))} className="text-cyan-400 hover:underline cursor-pointer font-bold">+0.1%</button> para autorizar automáticamente
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status banner */}
      {lastActionMessage && (
        <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-3 text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{lastActionMessage}</span>
        </div>
      )}

      {/* MODAL DE FÓRMULA MATEMÁTICA Y AUTO-RECARGA DE GAS */}
      {showFormulaModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-800/60 rounded-xl max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">
                  Fórmula Matemática del Bot de Rotación
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFormulaModal(false)}
                className="text-slate-400 hover:text-white px-2 py-1 rounded text-sm bg-slate-800 hover:bg-slate-700"
              >
                ✕ Cerrar
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-300 leading-relaxed">
              {/* 1. Spread */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                <div className="font-bold text-white flex items-center justify-between text-xs">
                  <span className="text-cyan-400">1. Spread Bruto de Rentabilidad Relativa</span>
                  <span className="font-mono text-emerald-400">
                    {activeMetrics ? `+${activeMetrics.spread.toFixed(2)}%` : "0.00%"}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Mide la divergencia porcentual de precios entre el token que vendes y el que compras desde que se inició la estrategia:
                </p>
                <div className="bg-slate-900 p-2 rounded font-mono text-[11px] text-slate-200 border border-slate-800">
                  Spread = Δ Rendimiento ({activeSwapFrom}) − Δ Rendimiento ({activeSwapTo})
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Donde: Δ = ((Precio Actual − Precio Base) / Precio Base) × 100
                </div>
              </div>

              {/* 2. Costes */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                <div className="font-bold text-white flex items-center justify-between text-xs">
                  <span className="text-amber-400">2. Deducción de Costes Operativos Totales</span>
                  <span className="font-mono text-amber-300">
                    {activeMetrics ? `-$${activeMetrics.totalCostsUsd.toFixed(4)} USD` : "$0.00"}
                  </span>
                </div>
                <div className="bg-slate-900 p-2 rounded font-mono text-[11px] text-slate-200 border border-slate-800">
                  Costes = Gas Solana + Deslizamiento (Slippage) + Tarifa Creador + Auto-Recarga SOL
                </div>
                <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-1">
                  <li><strong>Gas Solana:</strong> 0.000005 SOL fijo por firma en Mainnet (~$0.0005 USD).</li>
                  <li><strong>Jupiter DEX Protocol Fee:</strong> 0.00% (gratuito a nivel de protocolo).</li>
                  <li><strong>Deslizamiento (MEV Protection):</strong> {activeMetrics?.slippagePercent ?? 0.05}% estimado.</li>
                  <li><strong>Tarifa del Creador:</strong> {activeMetrics?.platformFeePercent ?? 0.15}% (0.15% transferido on-chain).</li>
                  <li className="text-purple-300">
                    <strong>Auto-Recarga Gas SOL (Nueva Cobertura):</strong> Si rotas tokens SPL (ej. BTC ➔ ETH) y la reserva de SOL es inferior a 0.004 SOL, la fórmula descuenta una micro-fracción de {activeSwapFrom} y ejecuta un micro-swap a SOL para reponer el gas de la sub-wallet.
                  </li>
                </ul>
              </div>

              {/* 3. Ganancia Neta */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                <div className="font-bold text-white flex items-center justify-between text-xs">
                  <span className="text-emerald-400">3. Ganancia Neta Real Resultante</span>
                  <span className="font-mono text-emerald-300 font-bold text-sm">
                    {activeMetrics ? `${activeMetrics.netGainPercent >= 0 ? "+" : ""}${activeMetrics.netGainPercent.toFixed(2)}%` : "0.00%"}
                  </span>
                </div>
                <div className="bg-slate-900 p-2 rounded font-mono text-[11px] text-slate-200 border border-slate-800">
                  Ganancia Neta (USD) = (Capital Origen USD × Spread / 100) − Costes Totales USD
                </div>
                <div className="bg-slate-900 p-2 rounded font-mono text-[11px] text-slate-200 border border-slate-800">
                  % Ganancia Neta = (Ganancia Neta USD / Capital Origen USD) × 100
                </div>
              </div>

              {/* 4. Regla de Disparo */}
              <div className="bg-slate-950 p-3 rounded-lg border border-cyan-800/60 bg-cyan-950/20 space-y-1.5">
                <div className="font-bold text-cyan-300 text-xs">
                  4. Condición Estricta de Autorización de Swap
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-xs text-white">
                  ¿% Ganancia Neta ≥ Umbral Mínimo (+{activeMetrics?.minNetGain.toFixed(2)}%)?
                </div>
                <p className="text-[11px] text-slate-300">
                  • Si <strong>CUMPLE</strong>: El bot ejecuta el swap de forma desatendida on-chain en Jupiter DEX.<br/>
                  • Si <strong>NO CUMPLE</strong>: El bot protege tu capital y espera a que el mercado amplíe el spread, o te permite forzar el swap manualmente si así lo decides.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFormulaModal(false)}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
