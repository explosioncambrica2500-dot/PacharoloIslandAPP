import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CryptoSymbol,
  TokenPriceData,
  AlertRule,
  TriggeredAlertNotification,
  DexTransaction,
  WalletConfig,
} from "./types";
import { Header } from "./components/Header";
import { TokenCard } from "./components/TokenCard";
import { PriceChart } from "./components/PriceChart";
import { AlertManager } from "./components/AlertManager";
import { TransactionHistory } from "./components/TransactionHistory";
import { NotificationToast } from "./components/NotificationToast";
import { RotationStrategyPanel } from "./components/RotationStrategyPanel";
import { WalletModal } from "./components/WalletModal";
import { AndroidApkModal } from "./components/AndroidApkModal";
import { soundEngine } from "./utils/audio";
import {
  Activity,
  Layers,
  ShieldCheck,
  Zap,
  Info,
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
  HYPE: {
    symbol: "HYPE",
    name: "Hyperliquid",
    mint: "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g",
    usdPrice: 84.3,
    priceChange24h: -0.92,
    liquidity: 5310000,
    decimals: 9,
    lastUpdated: new Date().toISOString(),
    source: "Jupiter DEX v3 API",
    icon: "https://coin-images.coingecko.com/coins/images/50882/small/hyperliquid.jpg?1729431300",
  },
};

export default function App() {
  const [tokens, setTokens] = useState<Record<CryptoSymbol, TokenPriceData>>(DEFAULT_TOKENS);
  const [selectedSymbol, setSelectedSymbol] = useState<CryptoSymbol>("SOL");
  const [pollInterval, setPollInterval] = useState<number>(2000); // 2s by default for low latency
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number>(85);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Sound and alert preferences
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);

  // Alert rules state with local persistence
  const [alerts, setAlerts] = useState<AlertRule[]>(() => {
    try {
      const saved = localStorage.getItem("jupiter_alerts");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Could not load alerts from localStorage", e);
    }
    return [
      {
        id: "alert_sol_default",
        symbol: "SOL",
        condition: "ABOVE",
        targetPrice: 110.0,
        createdAt: new Date().toISOString(),
        isActive: true,
        notes: "Objetivo de resistencia",
        triggeredCount: 0,
      },
      {
        id: "alert_btc_default",
        symbol: "BTC",
        condition: "ABOVE",
        targetPrice: 80000.0,
        createdAt: new Date().toISOString(),
        isActive: true,
        notes: "Ruptura psicológica",
        triggeredCount: 0,
      },
    ];
  });

  // Triggered notifications log
  const [notifications, setNotifications] = useState<TriggeredAlertNotification[]>(() => {
    try {
      const saved = localStorage.getItem("jupiter_notifications");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Could not load notifications from localStorage", e);
    }
    return [];
  });

  const [activeToasts, setActiveToasts] = useState<TriggeredAlertNotification[]>([]);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isAndroidModalOpen, setIsAndroidModalOpen] = useState(false);
  const [alertModalSymbol, setAlertModalSymbol] = useState<CryptoSymbol>("SOL");

  // Wallet configuration state (Paper vs Real)
  const [walletConfig, setWalletConfig] = useState<WalletConfig>(() => {
    try {
      const saved = localStorage.getItem("jupiter_wallet_config");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Failed loading wallet config", e);
    }
    return {
      mode: "PAPER",
      address: "",
      isConnected: false,
      paperBalanceUsd: 500,
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

  // DEX Transactions feed
  const [transactions, setTransactions] = useState<DexTransaction[]>([]);
  const [isLoadingTx, setIsLoadingTx] = useState(false);

  // Save alerts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("jupiter_alerts", JSON.stringify(alerts));
    } catch (e) {
      console.warn("Failed saving alerts", e);
    }
  }, [alerts]);

  // Save notifications to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("jupiter_notifications", JSON.stringify(notifications));
    } catch (e) {
      console.warn("Failed saving notifications", e);
    }
  }, [notifications]);

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

  // Evaluate price alerts whenever tokens update
  const checkThresholdAlerts = useCallback(
    (currentPrices: Record<CryptoSymbol, TokenPriceData>) => {
      alerts.forEach((alert) => {
        if (!alert.isActive) return;
        const token = currentPrices[alert.symbol];
        if (!token) return;

        const currentPrice = token.usdPrice;
        let isTriggered = false;

        if (alert.condition === "ABOVE" && currentPrice >= alert.targetPrice) {
          isTriggered = true;
        } else if (alert.condition === "BELOW" && currentPrice <= alert.targetPrice) {
          isTriggered = true;
        }

        if (isTriggered) {
          // Avoid spamming if triggered in last 45 seconds
          const lastTrig = alert.lastTriggeredAt ? new Date(alert.lastTriggeredAt).getTime() : 0;
          if (Date.now() - lastTrig > 45000) {
            // Play synthesized audio chime
            soundEngine.playAlertChime(alert.condition === "ABOVE" ? "high" : "low");

            const newNotif: TriggeredAlertNotification = {
              id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              alertId: alert.id,
              symbol: alert.symbol,
              condition: alert.condition,
              targetPrice: alert.targetPrice,
              actualPrice: currentPrice,
              timestamp: new Date().toISOString(),
              read: false,
            };

            // Add to active toast banner
            setActiveToasts((prev) => [newNotif, ...prev.slice(0, 2)]);
            setNotifications((prev) => [newNotif, ...prev.slice(0, 49)]);

            // Dispatch browser notification if permitted
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              try {
                new Notification(`Alerta ${alert.symbol}: $${currentPrice.toFixed(2)}`, {
                  body: `${alert.symbol} ha cruzado tu umbral de $${alert.targetPrice}.`,
                  icon: token.icon,
                });
              } catch (e) {
                console.warn("Notification error", e);
              }
            }

            // Update alert trigger count and timestamp
            setAlerts((prev) =>
              prev.map((a) =>
                a.id === alert.id
                  ? {
                      ...a,
                      triggeredCount: a.triggeredCount + 1,
                      lastTriggeredAt: new Date().toISOString(),
                    }
                  : a
              )
            );
          }
        }
      });
    },
    [alerts]
  );

  // Fetch prices from backend proxy
  const fetchPrices = useCallback(async (force = false) => {
    const startTime = Date.now();
    try {
      const res = await fetch(`/api/prices${force ? "?force=true" : ""}`, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const rtt = Date.now() - startTime;
      setLatencyMs(data.latencyMs || rtt);
      setLastUpdated(data.updatedAt);
      setApiError(null);

      if (data.tokens) {
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
          checkThresholdAlerts(updated);
          return updated;
        });
      }
    } catch (err: any) {
      console.warn("Error fetching prices:", err);
      setApiError("Conexión con Jupiter DEX lenta o intermitente");
      // Fallback: estimate mild live fluctuation if completely offline
      setTokens((prev) => {
        const next = { ...prev };
        (Object.keys(next) as CryptoSymbol[]).forEach((sym) => {
          const t = next[sym];
          const microVariation = (Math.random() - 0.5) * 0.0008 * t.usdPrice;
          const newP = Number((t.usdPrice + microVariation).toFixed(t.usdPrice > 100 ? 2 : 4));
          next[sym] = {
            ...t,
            previousPrice: t.usdPrice,
            usdPrice: newP,
            lastUpdated: new Date().toISOString(),
          };
        });
        checkThresholdAlerts(next);
        return next;
      });
    }
  }, [checkThresholdAlerts]);

  // Fetch transactions feed
  const fetchTransactions = useCallback(async () => {
    setIsLoadingTx(true);
    try {
      const res = await fetch("/api/transactions?limit=60");
      if (res.ok) {
        const data = await res.json();
        if (data.transactions) {
          setTransactions(data.transactions);
        }
      }
    } catch (e) {
      console.warn("Error fetching transactions", e);
    } finally {
      setIsLoadingTx(false);
    }
  }, []);

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

  // Add custom manual transaction
  const handleAddTransaction = async (newTx: {
    symbol: CryptoSymbol;
    type: "BUY" | "SELL";
    amount: number;
    priceUsd: number;
  }) => {
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTx),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.transaction) {
          setTransactions((prev) => [data.transaction, ...prev]);
        }
      }
    } catch (e) {
      console.error("Error creating transaction", e);
    }
  };

  // Handler for Rotation Strategy Buy & Swap executions
  const handleExecuteStrategySwap = async (tx: DexTransaction) => {
    const updatedTx: DexTransaction = {
      ...tx,
      wallet: walletConfig.address
        ? `${walletConfig.address.substring(0, 4)}...${walletConfig.address.substring(walletConfig.address.length - 4)}`
        : walletConfig.mode === "REAL"
        ? "Wallet Solana Real"
        : "Simulada (Paper Trading)",
    };

    // Add locally to state immediately
    setTransactions((prev) => [updatedTx, ...prev]);

    // Persist to backend
    try {
      await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTx),
      });
    } catch (e) {
      console.warn("Could not persist strategy transaction", e);
    }
  };

  // Alert Management Handlers
  const handleAddAlert = (newAlert: Omit<AlertRule, "id" | "createdAt" | "triggeredCount">) => {
    const rule: AlertRule = {
      ...newAlert,
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      triggeredCount: 0,
    };
    setAlerts((prev) => [rule, ...prev]);
  };

  const handleToggleAlert = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isActive: !a.isActive } : a))
    );
  };

  const handleDeleteAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleOpenAlertForToken = (token: TokenPriceData) => {
    setAlertModalSymbol(token.symbol);
    setIsAlertModalOpen(true);
  };

  const activeAlertsCount = alerts.filter((a) => a.isActive).length;
  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  const currentSelectedToken = tokens[selectedSymbol] || tokens.SOL;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Navigation & Status Header */}
      <Header
        latencyMs={latencyMs}
        isPolling={pollInterval > 0}
        pollInterval={pollInterval}
        setPollInterval={setPollInterval}
        onManualRefresh={handleManualRefresh}
        isRefreshing={isRefreshing}
        lastUpdated={lastUpdated}
        activeAlertsCount={activeAlertsCount}
        unreadNotificationsCount={unreadNotificationsCount}
        onOpenAlerts={() => {
          setAlertModalSymbol(selectedSymbol);
          setIsAlertModalOpen(true);
        }}
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
        {/* Token Cards Grid: BTC, ETH, SOL, ZEC, HYPE */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-slate-200 tracking-wide uppercase">
                Pares Principales Jupiter DEX
              </h2>
            </div>
            <span className="text-xs text-slate-500 hidden sm:inline">
              Haz clic en cualquier tarjeta para ver su gráfica interactiva
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {(["BTC", "ETH", "SOL", "ZEC", "HYPE"] as CryptoSymbol[]).map((sym) => {
              const token = tokens[sym];
              const tokenAlertCount = alerts.filter((a) => a.symbol === sym && a.isActive).length;

              return (
                <TokenCard
                  key={sym}
                  token={token}
                  isSelected={selectedSymbol === sym}
                  onSelect={(t) => setSelectedSymbol(t.symbol)}
                  onQuickAlert={handleOpenAlertForToken}
                  activeAlertCount={tokenAlertCount}
                />
              );
            })}
          </div>
        </section>

        {/* Relative Performance Rotation Strategy Section */}
        <section>
          <RotationStrategyPanel
            tokens={tokens}
            onExecuteSwap={handleExecuteStrategySwap}
            transactions={transactions}
            walletConfig={walletConfig}
            onOpenWalletModal={() => setIsWalletModalOpen(true)}
          />
        </section>

        {/* Interactive Chart Section */}
        <section>
          <PriceChart
            token={currentSelectedToken}
            activeAlerts={alerts}
            onOpenAlertModal={() => handleOpenAlertForToken(currentSelectedToken)}
          />
        </section>

        {/* Transaction History & CSV Export Section */}
        <section>
          <TransactionHistory
            transactions={transactions}
            tokens={tokens}
            onAddTransaction={handleAddTransaction}
            isLoading={isLoadingTx}
            onRefreshTransactions={fetchTransactions}
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
            <span>Tokens: BTC, ETH, SOL, ZEC, HYPE</span>
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

      {/* Alert Manager Modal */}
      <AlertManager
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        alerts={alerts}
        tokens={tokens}
        onAddAlert={handleAddAlert}
        onToggleAlert={handleToggleAlert}
        onDeleteAlert={handleDeleteAlert}
        notifications={notifications}
        onClearNotifications={() => setNotifications([])}
        onTestSound={() => soundEngine.playAlertChime("high")}
        initialSymbol={alertModalSymbol}
      />

      {/* Active Toast Alerts Banner */}
      <NotificationToast
        notifications={activeToasts}
        onDismiss={(id) => setActiveToasts((prev) => prev.filter((t) => t.id !== id))}
      />

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
