import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CryptoSymbol,
  TokenPriceData,
  DexTransaction,
  WalletConfig,
} from "./types";
import { Header } from "./components/Header";
import { TransactionHistory } from "./components/TransactionHistory";
import { RotationStrategyPanel } from "./components/RotationStrategyPanel";
import { TopTradersLeaderboard } from "./components/TopTradersLeaderboard";
import { WalletModal } from "./components/WalletModal";
import { AndroidApkModal } from "./components/AndroidApkModal";
import { LanguageProvider } from "./utils/i18n";
import { soundEngine } from "./utils/audio";
import { fetchLivePricesDirect } from "./utils/priceFeed";
import { getOrCreateBotKeypair, WALLET_UPDATED_EVENT } from "./utils/solanaBot";
import {
  Activity,
  Zap,
  ExternalLink,
} from "lucide-react";

const DEFAULT_TOKENS: Record<CryptoSymbol, TokenPriceData> = {
  SOL: {
    symbol: "SOL",
    name: "Solana",
    mint: "So11111111111111111111111111111111111111112",
    usdPrice: 102.85,
    priceChange24h: -2.3,
    liquidity: 830500000,
    decimals: 9,
    lastUpdated: new Date().toISOString(),
    source: "Jupiter DEX v3 API",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  },
  BTC: {
    symbol: "BTC",
    name: "Bitcoin (Portal / WBTC)",
    mint: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
    usdPrice: 78450.0,
    priceChange24h: -1.65,
    liquidity: 35600000,
    decimals: 8,
    lastUpdated: new Date().toISOString(),
    source: "Jupiter DEX v3 API",
    icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh/logo.png",
  },
  ETH: {
    symbol: "ETH",
    name: "Ether (Portal)",
    mint: "7vfCXTUXx5WJV5JADk17DUJ4ksau7utNKj4b963voxs",
    usdPrice: 2471.5,
    priceChange24h: -1.35,
    liquidity: 22250000,
    decimals: 8,
    lastUpdated: new Date().toISOString(),
    source: "Jupiter DEX API",
    icon: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  },
  JUP: {
    symbol: "JUP",
    name: "Jupiter",
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    usdPrice: 0.225,
    priceChange24h: -9.5,
    liquidity: 18500000,
    decimals: 6,
    lastUpdated: new Date().toISOString(),
    source: "Jupiter DEX API",
    icon: "https://assets.coingecko.com/coins/images/34188/small/jup.png",
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    usdPrice: 1.0,
    priceChange24h: 0.0,
    liquidity: 500000000,
    decimals: 6,
    lastUpdated: new Date().toISOString(),
    source: "Jupiter DEX API",
    icon: "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png",
  },
  ZEC: {
    symbol: "ZEC",
    name: "Zcash",
    mint: "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS",
    usdPrice: 1129.5,
    priceChange24h: -6.75,
    liquidity: 3540000,
    decimals: 8,
    lastUpdated: new Date().toISOString(),
    source: "Jupiter DEX v3 API",
    icon: "https://assets.coingecko.com/coins/images/486/small/circle-zcash-color.png",
  },
};

function getSessionClientId(): string {
  try {
    let id = sessionStorage.getItem("pacharolo_client_id");
    if (!id) {
      id = "client_" + Math.random().toString(36).substring(2, 10);
      sessionStorage.setItem("pacharolo_client_id", id);
    }
    return id;
  } catch {
    return "client_default";
  }
}

function MainApp() {
  const [tokens, setTokens] = useState<Record<CryptoSymbol, TokenPriceData>>(DEFAULT_TOKENS);
  const tokensRef = useRef(tokens);
  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  const [pollInterval, setPollInterval] = useState<number>(2000); // 2s by default
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number>(85);
  const [activeUsersCount, setActiveUsersCount] = useState<number>(1);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Sound preferences
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isAndroidModalOpen, setIsAndroidModalOpen] = useState(false);

  // Wallet configuration state (Real Solana Mode) - synchronized with real Solana keypair
  const [walletConfig, setWalletConfig] = useState<WalletConfig>(() => {
    const defaultKp = getOrCreateBotKeypair();
    try {
      const saved = localStorage.getItem("jupiter_wallet_config");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Si tiene la clave dummy anterior "Jup4..." o está vacía, reemplazar con la clave real del bot
        if (
          !parsed.address ||
          parsed.address.includes("Jup4") ||
          parsed.address.includes("Phantom7x") ||
          parsed.address.includes("Solflare9B")
        ) {
          parsed.address = defaultKp.publicKey;
          parsed.isConnected = true;
          parsed.providerName = "Solana Sub-Wallet";
        }
        parsed.mode = "REAL";
        parsed.paperBalanceUsd = 0;
        return parsed;
      }
    } catch (e) {
      console.warn("Failed loading wallet config", e);
    }
    return {
      mode: "REAL",
      address: defaultKp.publicKey,
      isConnected: true,
      providerName: "Solana Sub-Wallet",
      paperBalanceUsd: 0,
    };
  });

  // Save wallet config to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("jupiter_wallet_config", JSON.stringify(walletConfig));
    } catch (e) {
      console.warn("Failed saving wallet config", e);
    }
  }, [walletConfig]);

  // Synchronize state when wallet is regenerated or imported anywhere
  useEffect(() => {
    const handleWalletUpdated = (e: any) => {
      if (e.detail?.publicKey) {
        setWalletConfig((prev) => ({
          ...prev,
          address: e.detail.publicKey,
          isConnected: true,
          providerName: prev.providerName || "Solana Wallet",
        }));
      }
    };
    window.addEventListener(WALLET_UPDATED_EVENT, handleWalletUpdated);
    return () => window.removeEventListener(WALLET_UPDATED_EVENT, handleWalletUpdated);
  }, []);

  // Precios base fijados en el momento de lanzamiento de ejecución del bot
  const [baselinePrices, setBaselinePrices] = useState<Record<CryptoSymbol, number>>(() => {
    try {
      const saved = localStorage.getItem("pacharolo_baseline_prices");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      BTC: 78450.0,
      ETH: 2471.5,
      JUP: 0.225,
      USDC: 1.0,
      SOL: 102.85,
      ZEC: 1129.5,
    };
  });

  const [botExecutionLaunchedAt, setBotExecutionLaunchedAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem("pacharolo_bot_launched_at");
    } catch {
      return null;
    }
  });

  const handleResetBaseline = (newBaselines?: Record<CryptoSymbol, number>) => {
    const updated: Record<CryptoSymbol, number> = newBaselines || {
      BTC: tokensRef.current.BTC?.usdPrice || 78450.0,
      ETH: tokensRef.current.ETH?.usdPrice || 2471.5,
      JUP: tokensRef.current.JUP?.usdPrice || 0.225,
      USDC: tokensRef.current.USDC?.usdPrice || 1.0,
      SOL: tokensRef.current.SOL?.usdPrice || 102.85,
      ZEC: tokensRef.current.ZEC?.usdPrice || 1129.5,
    };
    setBaselinePrices(updated);
    const now = new Date().toISOString();
    setBotExecutionLaunchedAt(now);
    try {
      localStorage.setItem("pacharolo_baseline_prices", JSON.stringify(updated));
      localStorage.setItem("pacharolo_bot_launched_at", now);
    } catch {}
  };

  // DEX Transactions feed initialized with localStorage fallback (strictly REAL on-chain swaps only)
  const [transactions, setTransactions] = useState<DexTransaction[]>(() => {
    try {
      const saved = localStorage.getItem("jupiter_transactions");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (tx: DexTransaction) =>
              tx.isRealOnChain === true &&
              !tx.wallet?.toLowerCase().includes("simulac") &&
              !tx.dex?.toLowerCase().includes("simulac") &&
              !(tx.type === "INITIAL_BUY" && (tx.totalUsd === 500 || tx.id?.includes("init_buy_")))
          );
        }
      }
    } catch (e) {
      console.warn("Could not load transactions from localStorage", e);
    }
    return [];
  });
  const [isLoadingTx, setIsLoadingTx] = useState(false);

  // Sync transactions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("jupiter_transactions", JSON.stringify(transactions));
    } catch (e) {
      console.warn("Failed saving transactions to localStorage", e);
    }
  }, [transactions]);

  // Check browser notification permission status on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserNotificationsEnabled(Notification.permission === "granted");
    }
  }, []);

  const requestBrowserNotification = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const permission = await Notification.requestPermission();
      setBrowserNotificationsEnabled(permission === "granted");
      if (permission === "granted") {
        new Notification("Jupiter DEX Price Monitor", {
          body: "¡Notificaciones de navegador activadas con éxito!",
        });
      }
    }
  };

  // Fetch prices: First try server /api/prices, then seamlessly fallback to direct multi-oracle client feed
  const fetchPrices = useCallback(async (force = false) => {
    const startTime = Date.now();
    try {
      const res = await fetch(`/api/prices${force ? "?force=true" : ""}`, {
        headers: {
          Accept: "application/json",
          "x-client-id": getSessionClientId(),
        },
      });

      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        throw new Error(`Non-JSON response or static host: ${res.status}`);
      }

      const data = await res.json();
      if (!data.tokens) throw new Error("No tokens in API response");

      if (typeof data.activeUsers === "number") {
        setActiveUsersCount(data.activeUsers);
      }

      const rtt = Date.now() - startTime;
      setLatencyMs(data.latencyMs || rtt);
      setLastUpdated(data.updatedAt);
      setApiError(null);

      setTokens((prev) => {
        const updated = { ...prev };
        (Object.keys(data.tokens) as CryptoSymbol[]).forEach((sym) => {
          const tokenData = data.tokens[sym];
          if (tokenData) {
            updated[sym] = {
              ...tokenData,
              previousPrice: prev[sym]?.usdPrice ?? tokenData.usdPrice,
            };
          }
        });
        return updated;
      });
      return;
    } catch (_serverErr) {
      // Automatic client-side failover: queries live DEX & Binance/CoinGecko oracles directly
      try {
        const directData = await fetchLivePricesDirect(tokensRef.current);
        setLatencyMs(directData.latencyMs);
        setLastUpdated(directData.updatedAt);
        setApiError(null);

        setTokens((prev) => {
          const updated = { ...prev };
          (Object.keys(directData.tokens) as CryptoSymbol[]).forEach((sym) => {
            const tokenData = directData.tokens[sym];
            if (tokenData) {
              updated[sym] = {
                ...tokenData,
                previousPrice: prev[sym]?.usdPrice ?? tokenData.usdPrice,
              };
            }
          });
          return updated;
        });
        return;
      } catch (directErr) {
        console.warn("Direct price feed error:", directErr);
        setApiError("Conexión con oráculos DEX lenta o intermitente");
      }
    }
  }, []);

  // Fetch transactions feed (from backend if available, or keep local state)
  const fetchTransactions = useCallback(async () => {
    setIsLoadingTx(true);
    try {
      const walletParam = walletConfig.address ? `&wallet=${encodeURIComponent(walletConfig.address)}` : "";
      const res = await fetch(`/api/transactions?limit=60${walletParam}`);
      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json();
        if (data.transactions && Array.isArray(data.transactions) && data.transactions.length > 0) {
          // Merge with user's local transactions, strictly retaining only real on-chain swaps
          setTransactions((prev) => {
            const userOnlyServerTx = data.transactions.filter((tx: DexTransaction) =>
              tx.isRealOnChain === true &&
              tx.isUserSwap !== false &&
              (!walletConfig.address || !tx.userWallet || tx.userWallet === walletConfig.address)
            );
            if (userOnlyServerTx.length === 0) return prev;
            const existingIds = new Set(prev.map((t) => t.id));
            const newTxs = userOnlyServerTx.filter((t: DexTransaction) => !existingIds.has(t.id));
            return [...newTxs, ...prev];
          });
        }
      }
    } catch (e) {
      // Offline/Static host: maintained in localStorage
    } finally {
      setIsLoadingTx(false);
    }
  }, [walletConfig.address]);

  // Polling loop for prices
  useEffect(() => {
    fetchPrices();
    fetchTransactions();

    if (pollInterval === 0) return;

    const timer = setInterval(() => {
      fetchPrices();
    }, pollInterval);

    return () => clearInterval(timer);
  }, [pollInterval, fetchPrices, fetchTransactions]);

  // Periodic transaction refresh every 10s
  useEffect(() => {
    const txTimer = setInterval(() => {
      fetchTransactions();
    }, 10000);
    return () => clearInterval(txTimer);
  }, [fetchTransactions]);

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchPrices(true), fetchTransactions()]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Add custom manual transaction (Real only)
  const handleAddTransaction = async (newTx: {
    symbol: CryptoSymbol;
    type: "BUY" | "SELL";
    amount: number;
    priceUsd: number;
  }) => {
    // Exclude simulation transactions from bot history
    if (walletConfig.mode !== "REAL") {
      return;
    }

    const createdTx: DexTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      symbol: newTx.symbol,
      type: newTx.type,
      amount: newTx.amount,
      priceUsd: newTx.priceUsd,
      totalUsd: Number((newTx.amount * newTx.priceUsd).toFixed(2)),
      txHash: `SOL${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      dex: "Jupiter DEX Router (Solana Mainnet)",
      wallet: walletConfig.address
        ? `${walletConfig.address.substring(0, 4)}...${walletConfig.address.substring(walletConfig.address.length - 4)}`
        : "Wallet Solana Real",
      status: "CONFIRMED",
      isRealOnChain: true,
      isUserSwap: true,
      userWallet: walletConfig.address || "local_user",
    };

    setTransactions((prev) => [createdTx, ...prev]);

    try {
      await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createdTx),
      });
    } catch (e) {
      // Local state preserved
    }
  };

  // Handler for Rotation Strategy Buy & Swap executions
  const handleExecuteStrategySwap = async (tx: DexTransaction) => {
    const isReal = Boolean(tx.isRealOnChain ?? true);

    // Strictly exclude simulation swaps from bot operations history
    if (!isReal) {
      return;
    }

    const updatedTx: DexTransaction = {
      ...tx,
      isRealOnChain: true,
      isUserSwap: true,
      userWallet: walletConfig.address || "local_user",
      wallet:
        tx.wallet ||
        `Sub-Wallet (${walletConfig.address ? walletConfig.address.substring(0, 4) + "..." + walletConfig.address.substring(walletConfig.address.length - 4) : "Solana"})`,
      dex: tx.dex || "Jupiter DEX (Solana Mainnet)",
    };

    setTransactions((prev) => [updatedTx, ...prev]);

    try {
      await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTx),
      });
    } catch (e) {
      // Local state preserved
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Navigation & Status Header */}
      <Header
        latencyMs={latencyMs}
        activeUsersCount={activeUsersCount}
        isPolling={pollInterval > 0}
        pollInterval={pollInterval}
        setPollInterval={setPollInterval}
        onManualRefresh={handleManualRefresh}
        isRefreshing={isRefreshing}
        lastUpdated={lastUpdated}
        soundEnabled={soundEnabled}
        onToggleSound={() => {
          const next = !soundEnabled;
          setSoundEnabled(next);
          soundEngine.setEnabled(next);
        }}
        browserNotificationsEnabled={browserNotificationsEnabled}
        onRequestBrowserNotification={requestBrowserNotification}
        apiError={apiError}
        walletConfig={walletConfig}
        onOpenWalletModal={() => setIsWalletModalOpen(true)}
        onOpenAndroidModal={() => setIsAndroidModalOpen(true)}
      />

      {/* Main Dashboard Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8 space-y-6">
        {/* 1. Modulo de Estrategia de Rotacion por Porcentaje */}
        <section>
          <RotationStrategyPanel
            tokens={tokens}
            onExecuteSwap={handleExecuteStrategySwap}
            transactions={transactions}
            walletConfig={walletConfig}
            onOpenWalletModal={() => setIsWalletModalOpen(true)}
            onUpdateWalletConfig={setWalletConfig}
            baselinePrices={baselinePrices}
            botExecutionLaunchedAt={botExecutionLaunchedAt}
            onResetBaseline={handleResetBaseline}
          />
        </section>

        {/* 2. Historial de Operaciones del Bot (Solo swaps del propio usuario) */}
        <section>
          <TransactionHistory
            transactions={transactions}
            currentUserWallet={walletConfig.address}
            tokens={tokens}
            onAddTransaction={handleAddTransaction}
            isLoading={isLoadingTx}
            onRefreshTransactions={fetchTransactions}
          />
        </section>

        {/* 3. Listado de Principales Usuarios con Mayor Volumen de Swaps (Excluye swaps en simulación) */}
        <section>
          <TopTradersLeaderboard
            currentUserWallet={walletConfig.address}
            userTransactions={transactions}
            walletMode={walletConfig.mode}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-4 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <span>Jupiter DEX Core Solana Aggregator • Precios en tiempo real con latencia mínima</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Tokens: BTC, ETH, JUP, USDC, SOL, ZEC</span>
            <span>•</span>
            <a
              href="https://jup.ag"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-cyan-400 flex items-center gap-1 transition-colors"
            >
              <span>Jupiter DEX</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>

      {/* Wallet Solana Configuration Modal */}
      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        walletConfig={walletConfig}
        onUpdateWalletConfig={setWalletConfig}
      />

      {/* Android & APK Modal */}
      <AndroidApkModal
        isOpen={isAndroidModalOpen}
        onClose={() => setIsAndroidModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <MainApp />
    </LanguageProvider>
  );
}
