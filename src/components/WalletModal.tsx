import React, { useState, useEffect } from "react";
import {
  X,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  Terminal,
  Zap,
  Globe,
  Sliders,
  DollarSign,
  KeyRound,
  PlusCircle,
  Download,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  Key,
} from "lucide-react";
import { WalletConfig } from "../types";
import {
  getOrCreateBotKeypair,
  regenerateBotKeypair,
  importBotKeypair,
  validatePrivateKey,
  BotKeypairData,
  WALLET_UPDATED_EVENT,
} from "../utils/solanaBot";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletConfig: WalletConfig;
  onUpdateWalletConfig: (newConfig: WalletConfig) => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  onClose,
  walletConfig,
  onUpdateWalletConfig,
}) => {
  const [activeTab, setActiveTab] = useState<"connect" | "keys" | "guide" | "python">("connect");
  const [customAddress, setCustomAddress] = useState(walletConfig.address || "");
  const [selectedMode, setSelectedMode] = useState<"PAPER" | "REAL">(walletConfig.mode);
  const [paperBalance, setPaperBalance] = useState<number>(walletConfig.paperBalanceUsd || 500);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Key creation and import state
  const [importKeyInput, setImportKeyInput] = useState("");
  const [importKeyError, setImportKeyError] = useState<string | null>(null);
  const [showImportSecret, setShowImportSecret] = useState(false);
  const [createdKeyData, setCreatedKeyData] = useState<BotKeypairData | null>(null);
  const [showCreatedSecret, setShowCreatedSecret] = useState(false);
  const [copiedCreatedSecret, setCopiedCreatedSecret] = useState(false);

  useEffect(() => {
    setCustomAddress(walletConfig.address);
    setSelectedMode(walletConfig.mode);
    setPaperBalance(walletConfig.paperBalanceUsd || 500);
  }, [walletConfig, isOpen]);

  // Listen to global wallet changes
  useEffect(() => {
    const handleWalletUpdated = (e: any) => {
      if (e.detail?.publicKey) {
        setCustomAddress(e.detail.publicKey);
      }
    };
    window.addEventListener(WALLET_UPDATED_EVENT, handleWalletUpdated);
    return () => window.removeEventListener(WALLET_UPDATED_EVENT, handleWalletUpdated);
  }, []);

  if (!isOpen) return null;

  // Real-time validation for imported key
  const validationResult = importKeyInput.trim() ? validatePrivateKey(importKeyInput) : null;

  const handleGenerateNewWallet = () => {
    const newKp = regenerateBotKeypair();
    setCreatedKeyData(newKp);
    setCustomAddress(newKp.publicKey);
    const updated: WalletConfig = {
      mode: selectedMode,
      address: newKp.publicKey,
      providerName: "Solana Keypair (Creada)",
      isConnected: true,
      paperBalanceUsd: paperBalance,
    };
    onUpdateWalletConfig(updated);
    setStatusMessage(
      `✓ ¡Nueva wallet creada con éxito! Dirección: ${newKp.publicKey.substring(0, 6)}...${newKp.publicKey.substring(newKp.publicKey.length - 6)}`
    );
  };

  const handleImportPrivateKey = () => {
    setImportKeyError(null);
    const res = importBotKeypair(importKeyInput);
    if (!res.success || !res.data) {
      setImportKeyError(res.error || "Clave privada inválida.");
      return;
    }

    setCustomAddress(res.data.publicKey);
    setCreatedKeyData(res.data);
    const updated: WalletConfig = {
      mode: selectedMode,
      address: res.data.publicKey,
      providerName: "Wallet Importada (Self-Custody)",
      isConnected: true,
      paperBalanceUsd: paperBalance,
    };
    onUpdateWalletConfig(updated);
    setImportKeyInput("");
    setStatusMessage(
      `✓ ¡Wallet importada y activada con éxito! Dirección: ${res.data.publicKey.substring(0, 6)}...${res.data.publicKey.substring(res.data.publicKey.length - 6)}`
    );
  };

  const handleSyncWithBotSubWallet = () => {
    const currentBotKp = getOrCreateBotKeypair();
    setCustomAddress(currentBotKp.publicKey);
    setCreatedKeyData(currentBotKp);
    const updated: WalletConfig = {
      mode: selectedMode,
      address: currentBotKp.publicKey,
      providerName: "Sub-Wallet Bot",
      isConnected: true,
      paperBalanceUsd: paperBalance,
    };
    onUpdateWalletConfig(updated);
    setStatusMessage(
      `✓ Sincronizada con la sub-wallet del bot: ${currentBotKp.publicKey.substring(0, 6)}...${currentBotKp.publicKey.substring(currentBotKp.publicKey.length - 6)}`
    );
  };

  const hasJupiter =
    typeof window !== "undefined" &&
    (!!(window as any)?.jupiter ||
      !!(window as any)?.solana?.isJupiter ||
      !!(window as any)?.jupiterWallet);
  const hasPhantom = typeof window !== "undefined" && !!(window as any)?.solana?.isPhantom;
  const hasSolflare = typeof window !== "undefined" && !!(window as any)?.solflare;

  const handleConnectJupiter = async () => {
    setIsConnecting(true);
    setStatusMessage(null);
    try {
      const provider =
        (window as any)?.jupiter ||
        ((window as any)?.solana?.isJupiter ? (window as any).solana : null) ||
        (window as any)?.jupiterWallet;

      if (!provider) {
        // Usar la keypair de Solana local generada
        const currentKp = getOrCreateBotKeypair();
        const activeKey = currentKp.publicKey;
        const updated: WalletConfig = {
          mode: selectedMode,
          address: activeKey,
          providerName: "Jupiter DEX Wallet",
          isConnected: true,
          paperBalanceUsd: paperBalance,
        };
        onUpdateWalletConfig(updated);
        setCustomAddress(activeKey);
        setStatusMessage(
          `✓ Conectado con dirección Solana: ${activeKey.substring(0, 4)}...${activeKey.substring(activeKey.length - 4)}. Operando en Jupiter DEX.`
        );
        return;
      }

      const resp = await provider.connect();
      const pubKey =
        resp?.publicKey?.toString() ||
        provider.publicKey?.toString() ||
        "JUP_WALLET_ACTIVE";

      const updated: WalletConfig = {
        mode: selectedMode,
        address: pubKey,
        providerName: "Jupiter Wallet",
        isConnected: true,
        paperBalanceUsd: paperBalance,
      };
      onUpdateWalletConfig(updated);
      setCustomAddress(pubKey);
      setStatusMessage("¡Conectado exitosamente con Jupiter Wallet (Nativa de Jupiter DEX)!");
    } catch (err: any) {
      setStatusMessage(err?.message || "Conexión cancelada o rechazada por Jupiter Wallet.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectPhantom = async () => {
    setIsConnecting(true);
    setStatusMessage(null);
    try {
      const provider = (window as any).solana;
      if (!provider || !provider.isPhantom) {
        const activeKey = getOrCreateBotKeypair().publicKey;
        const updated: WalletConfig = {
          mode: selectedMode,
          address: activeKey,
          providerName: "Phantom",
          isConnected: true,
          paperBalanceUsd: paperBalance,
        };
        onUpdateWalletConfig(updated);
        setCustomAddress(activeKey);
        setStatusMessage(`✓ Conectado en modo Phantom Wallet (${activeKey.substring(0, 4)}...${activeKey.substring(activeKey.length - 4)}).`);
        return;
      }

      const resp = await provider.connect();
      const pubKey = resp.publicKey.toString();

      const updated: WalletConfig = {
        mode: selectedMode,
        address: pubKey,
        providerName: "Phantom",
        isConnected: true,
        paperBalanceUsd: paperBalance,
      };
      onUpdateWalletConfig(updated);
      setCustomAddress(pubKey);
      setStatusMessage("¡Conectado exitosamente con Phantom!");
    } catch (err: any) {
      setStatusMessage(err?.message || "Conexión cancelada o rechazada por el usuario.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectSolflare = async () => {
    setIsConnecting(true);
    setStatusMessage(null);
    try {
      const provider = (window as any)?.solflare;
      if (!provider) {
        const activeKey = getOrCreateBotKeypair().publicKey;
        const updated: WalletConfig = {
          mode: selectedMode,
          address: activeKey,
          providerName: "Solflare",
          isConnected: true,
          paperBalanceUsd: paperBalance,
        };
        onUpdateWalletConfig(updated);
        setCustomAddress(activeKey);
        setStatusMessage(`✓ Conectado en modo Solflare Wallet (${activeKey.substring(0, 4)}...${activeKey.substring(activeKey.length - 4)}).`);
        return;
      }

      await provider.connect();
      const pubKey = provider.publicKey.toString();

      const updated: WalletConfig = {
        mode: selectedMode,
        address: pubKey,
        providerName: "Solflare",
        isConnected: true,
        paperBalanceUsd: paperBalance,
      };
      onUpdateWalletConfig(updated);
      setCustomAddress(pubKey);
      setStatusMessage("¡Conectado exitosamente con Solflare!");
    } catch (err: any) {
      setStatusMessage(err?.message || "Conexión cancelada o rechazada por Solflare.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSaveManual = () => {
    const trimmed = customAddress.trim();
    const updated: WalletConfig = {
      mode: selectedMode,
      address: trimmed || "Simulated_Wallet_Treasury",
      providerName: trimmed ? "Manual Solana Address" : "Simulación Local",
      isConnected: !!trimmed,
      paperBalanceUsd: Number(paperBalance) || 500,
    };
    onUpdateWalletConfig(updated);
    setStatusMessage("Configuración de wallet guardada correctamente.");
  };

  const handleDisconnect = () => {
    if ((window as any)?.solana?.disconnect) {
      try {
        (window as any).solana.disconnect();
      } catch (e) {
        // ignore
      }
    }
    const resetConfig: WalletConfig = {
      mode: "PAPER",
      address: "",
      providerName: undefined,
      isConnected: false,
      paperBalanceUsd: 500,
    };
    onUpdateWalletConfig(resetConfig);
    setCustomAddress("");
    setStatusMessage("Wallet desconectada. Operando en modo Simulación predeterminado.");
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 p-0.5 flex items-center justify-center shadow-lg shadow-cyan-950/50">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Wallet className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Configuración de Wallet Solana
                </h2>
                <span
                  className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                    walletConfig.isConnected
                      ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/40"
                      : "bg-amber-950/60 text-amber-400 border-amber-800/40"
                  }`}
                >
                  {walletConfig.isConnected ? "Conectada" : "Modo Simulación"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Administra la conexión con Jupiter DEX (Solana) para swaps y arbitraje de rotación
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 bg-slate-950/40 border-b border-slate-800 flex gap-2 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab("connect")}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "connect"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Conectar y Modo</span>
          </button>
          <button
            onClick={() => setActiveTab("keys")}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "keys"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Crear / Importar Wallet</span>
            <span className="text-[9px] bg-cyan-950 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-800/60 font-mono">
              NUEVO
            </span>
          </button>
          <button
            onClick={() => setActiveTab("guide")}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "guide"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Guía Paso a Paso</span>
          </button>
          <button
            onClick={() => setActiveTab("python")}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "python"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Configuración en Python</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-sm text-slate-300">
          {statusMessage && (
            <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/50 text-xs text-cyan-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {activeTab === "connect" && (
            <div className="space-y-5">
              {/* Quick Wallet Actions Banner */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-cyan-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-700/60 flex items-center justify-center text-cyan-400 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">¿Crear nueva wallet o importar tus claves?</span>
                    <span className="text-[11px] text-slate-400">Genera una nueva dirección Solana al instante o configura tu propia wallet con clave privada.</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleGenerateNewWallet}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow transition-colors flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Crear Nueva</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("keys")}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-semibold text-xs transition-colors flex items-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Importar Clave</span>
                  </button>
                </div>
              </div>

              {/* Mode Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
                  Modo de Operación
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Paper trading mode */}
                  <div
                    onClick={() => setSelectedMode("PAPER")}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedMode === "PAPER"
                        ? "bg-cyan-950/40 border-cyan-500 shadow-md ring-1 ring-cyan-500/20"
                        : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-white text-xs flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        Simulación (Paper Trading)
                      </span>
                      <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800/40">
                        Cero Riesgo
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Opera con un saldo virtual en USD. Prueba la compra de la moneda más barata y los swaps rotativos sin gastar SOL ni pagar tarifas de gas.
                    </p>
                  </div>

                  {/* Real on-chain mode */}
                  <div
                    onClick={() => setSelectedMode("REAL")}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedMode === "REAL"
                        ? "bg-cyan-950/40 border-cyan-500 shadow-md ring-1 ring-cyan-500/20"
                        : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-white text-xs flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-cyan-400" />
                        Modo Real (Solana Mainnet)
                      </span>
                      <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800/40">
                        Jupiter Router
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Conecta tu wallet real (Phantom/Solflare). Las órdenes se enrutan a través del contrato inteligente de Jupiter DEX en la red Solana.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Connect with Browser Extensions */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
                    Conectar con Wallets de Solana
                  </label>
                  {walletConfig.isConnected && (
                    <button
                      onClick={handleDisconnect}
                      className="px-2.5 py-1 rounded-md bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 text-[11px] font-semibold transition-colors"
                    >
                      Desconectar ({walletConfig.providerName || "Wallet"})
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* 1. JUPITER WALLET (NATIVE / RECOMENDADA) */}
                  <button
                    type="button"
                    onClick={handleConnectJupiter}
                    disabled={isConnecting}
                    className={`relative p-3 rounded-xl border text-left flex flex-col justify-between transition-all group ${
                      walletConfig.isConnected && walletConfig.providerName === "Jupiter Wallet"
                        ? "bg-gradient-to-br from-emerald-950/80 via-slate-900 to-cyan-950/80 border-cyan-400 ring-2 ring-cyan-400/40 shadow-lg shadow-cyan-950/60"
                        : "bg-slate-950/80 hover:bg-slate-900 border-cyan-800/40 hover:border-cyan-500 shadow-md"
                    }`}
                  >
                    <div className="flex items-start justify-between w-full mb-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 via-teal-400 to-emerald-400 p-0.5 flex items-center justify-center shadow-md">
                        <div className="w-full h-full bg-slate-950 rounded-[6px] flex items-center justify-center text-sm">
                          🪐
                        </div>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700/60 uppercase">
                        Nativa DEX
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-white text-xs block group-hover:text-cyan-300 transition-colors">
                          Jupiter Wallet
                        </span>
                        {hasJupiter && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Extensión detectada" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                        Cero fees extra, enrutado directo a Jupiter DEX v6
                      </p>
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-cyan-400 font-medium">
                      <span>
                        {walletConfig.isConnected && walletConfig.providerName === "Jupiter Wallet"
                          ? "✓ Conectada"
                          : hasJupiter
                          ? "Conectar extensión"
                          : "Conectar / Simular"}
                      </span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </div>
                  </button>

                  {/* 2. PHANTOM WALLET */}
                  <button
                    type="button"
                    onClick={handleConnectPhantom}
                    disabled={isConnecting}
                    className={`relative p-3 rounded-xl border text-left flex flex-col justify-between transition-all group ${
                      walletConfig.isConnected && walletConfig.providerName === "Phantom"
                        ? "bg-gradient-to-br from-purple-950/80 via-slate-900 to-slate-950 border-purple-400 ring-2 ring-purple-400/40 shadow-lg shadow-purple-950/60"
                        : "bg-slate-950/80 hover:bg-slate-900 border-slate-800 hover:border-purple-500/50 shadow-md"
                    }`}
                  >
                    <div className="flex items-start justify-between w-full mb-2">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-sm shadow-md">
                        👻
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/50">
                        Popular
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-white text-xs block group-hover:text-purple-300 transition-colors">
                          Phantom
                        </span>
                        {hasPhantom && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Extensión detectada" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                        La wallet Web3 más extendida para Solana
                      </p>
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-purple-400 font-medium">
                      <span>
                        {walletConfig.isConnected && walletConfig.providerName === "Phantom"
                          ? "✓ Conectada"
                          : hasPhantom
                          ? "Conectar extensión"
                          : "Conectar / Simular"}
                      </span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </div>
                  </button>

                  {/* 3. SOLFLARE WALLET */}
                  <button
                    type="button"
                    onClick={handleConnectSolflare}
                    disabled={isConnecting}
                    className={`relative p-3 rounded-xl border text-left flex flex-col justify-between transition-all group ${
                      walletConfig.isConnected && walletConfig.providerName === "Solflare"
                        ? "bg-gradient-to-br from-amber-950/80 via-slate-900 to-slate-950 border-amber-400 ring-2 ring-amber-400/40 shadow-lg shadow-amber-950/60"
                        : "bg-slate-950/80 hover:bg-slate-900 border-slate-800 hover:border-amber-500/50 shadow-md"
                    }`}
                  >
                    <div className="flex items-start justify-between w-full mb-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-sm shadow-md">
                        🔥
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/50">
                        Solana
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-white text-xs block group-hover:text-amber-300 transition-colors">
                          Solflare
                        </span>
                        {hasSolflare && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Extensión detectada" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                        Compatible con hardware Ledger y Solana
                      </p>
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-amber-400 font-medium">
                      <span>
                        {walletConfig.isConnected && walletConfig.providerName === "Solflare"
                          ? "✓ Conectada"
                          : hasSolflare
                          ? "Conectar extensión"
                          : "Conectar / Simular"}
                      </span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </div>
                  </button>
                </div>
              </div>

              {/* Manual Address Input */}
              <div className="space-y-2 pt-1 border-t border-slate-800/80">
                <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
                  O introduce tu dirección pública de Solana (Public Key)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customAddress}
                    onChange={(e) => setCustomAddress(e.target.value)}
                    placeholder="Ej: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleSaveManual}
                    className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition-colors"
                  >
                    Guardar
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Tu clave pública se utilizará en los registros de transacciones y exportaciones CSV. <strong>Nunca</strong> introduzcas tu clave privada aquí.
                </p>
              </div>

              {/* Paper Balance Setting if in paper mode */}
              {selectedMode === "PAPER" && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                    <div>
                      <span className="text-xs font-semibold text-white block">
                        Capital Virtual Inicial (USD)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Monto simulado asignado para la primera compra
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-mono">$</span>
                    <input
                      type="number"
                      value={paperBalance}
                      onChange={(e) => setPaperBalance(Number(e.target.value))}
                      className="w-24 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-right text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    />
                    <span className="text-xs text-slate-400">USD</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "keys" && (
            <div className="space-y-5">
              {/* Active Wallet Status Banner */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Billetera Activa en la Aplicación
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                    {walletConfig.mode === "REAL" ? "⚡ En Vivo (Mainnet)" : "🧪 Simulación"}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="font-mono text-xs text-white truncate max-w-md">
                    {customAddress || "Ninguna billetera vinculada aún"}
                  </div>
                  {customAddress && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopy(customAddress)}
                        className="px-2.5 py-1 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 transition-colors"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copiado" : "Copiar"}
                      </button>
                      <a
                        href={`https://solscan.io/account/${customAddress}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded text-xs bg-slate-800 hover:bg-slate-700 text-cyan-400 flex items-center gap-1 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" /> Solscan
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 1: Generate Brand New Wallet */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-cyan-800/60 space-y-3 shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-700/50 flex items-center justify-center text-cyan-400 shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        1. Crear Nueva Wallet Solana (1-Click)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Genera un nuevo par criptográfico de Solana (Ed25519) generado 100% de forma local en tu navegador.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateNewWallet}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-2"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Generar Nueva Wallet Solana Ahora
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncWithBotSubWallet}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                    Usar Sub-Wallet Existente del Bot
                  </button>
                </div>

                {/* Newly Created Keypair Details */}
                {createdKeyData && (
                  <div className="mt-3 p-3.5 rounded-xl bg-slate-900/90 border border-cyan-700/40 space-y-2.5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-xs text-cyan-300 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Wallet Generada y Activa:
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Lista para Jupiter DEX
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-400 font-medium">Dirección Pública (Public Key):</span>
                      <div className="font-mono text-xs text-white bg-slate-950 p-2 rounded border border-slate-800 break-all select-all flex items-center justify-between gap-2">
                        <span>{createdKeyData.publicKey}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(createdKeyData.publicKey)}
                          className="text-[11px] text-cyan-400 hover:text-white shrink-0 px-2 py-0.5 rounded bg-slate-900 border border-slate-700"
                        >
                          Copiar
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                        <span>Clave Privada (Secret Key Base58):</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowCreatedSecret(!showCreatedSecret)}
                            className="text-[11px] text-amber-300 hover:text-amber-200 flex items-center gap-1"
                          >
                            {showCreatedSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            {showCreatedSecret ? "Ocultar" : "Mostrar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(createdKeyData.secretKeyBase58);
                              setCopiedCreatedSecret(true);
                              setTimeout(() => setCopiedCreatedSecret(false), 2000);
                            }}
                            className="text-[11px] text-amber-200 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60 flex items-center gap-1"
                          >
                            {copiedCreatedSecret ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            {copiedCreatedSecret ? "Copiado" : "Copiar Clave"}
                          </button>
                        </div>
                      </div>
                      <div className="font-mono text-xs text-amber-200 bg-slate-950 p-2 rounded border border-amber-900/40 break-all select-all">
                        {showCreatedSecret ? createdKeyData.secretKeyBase58 : "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
                      </div>
                      <p className="text-[10px] text-amber-400/90 leading-tight">
                        ⚠️ <strong>Importante:</strong> Guarda tu clave privada si planeas fondear esta billetera con SOL real. Puedes importarla en Phantom o Solflare en cualquier momento.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 2: Import Private Key */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-700/50 flex items-center justify-center text-indigo-400 shrink-0">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      2. Configurar tu Propia Wallet (Importar Clave Privada)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Importa una wallet que ya tengas (Phantom, Solflare, Jupiter o Solana CLI) pegando su clave privada.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-300">
                      Clave Privada (Base58 de 64 o 32 bytes, o array JSON):
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowImportSecret(!showImportSecret)}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      {showImportSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showImportSecret ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>

                  <input
                    type={showImportSecret ? "text" : "password"}
                    value={importKeyInput}
                    onChange={(e) => {
                      setImportKeyInput(e.target.value);
                      setImportKeyError(null);
                    }}
                    placeholder="Pega aquí la clave privada (ej. 4vJUP... o [12, 45, ...])"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                {/* Validation Preview */}
                {validationResult && (
                  <div
                    className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                      validationResult.valid
                        ? "bg-emerald-950/60 border border-emerald-700/50 text-emerald-300"
                        : "bg-rose-950/60 border border-rose-800/50 text-rose-300"
                    }`}
                  >
                    {validationResult.valid ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div className="truncate">
                          <span className="font-semibold">✓ Clave válida detectada.</span> Dirección pública derivada:{" "}
                          <span className="font-mono text-white font-bold">{validationResult.publicKey}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{validationResult.error}</span>
                      </>
                    )}
                  </div>
                )}

                {importKeyError && (
                  <p className="text-xs text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {importKeyError}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    Procesado exclusivamente en tu navegador (0 servidores)
                  </span>
                  <button
                    type="button"
                    disabled={!validationResult?.valid}
                    onClick={handleImportPrivateKey}
                    className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs shadow-md transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Activar e Importar Billetera
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "guide" && (
            <div className="space-y-4 text-xs leading-relaxed text-slate-300">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-cyan-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 flex items-center justify-center text-xs font-black">
                      1
                    </span>
                    Jupiter Wallet (Nativa) o Phantom / Solflare
                  </h3>
                  <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800/60 font-semibold">
                    Recomendada DEX
                  </span>
                </div>
                <p className="text-slate-400">
                  Para operar en Jupiter DEX, la opción nativa más optimizada es <strong>Jupiter Wallet</strong> (extensión de navegador y app móvil con enrutamiento de latencia ultra baja y 0 comisiones extra). También puedes conectar <strong>Phantom</strong> o <strong>Solflare</strong> con un solo clic.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <a
                    href="https://jup.ag/wallet"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 font-semibold"
                  >
                    Obtener Jupiter Wallet (jup.ag) <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="text-slate-600">•</span>
                  <a
                    href="https://phantom.app/download"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-purple-400 hover:text-purple-300 font-semibold"
                  >
                    Descargar Phantom <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="text-slate-600">•</span>
                  <a
                    href="https://solflare.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-semibold"
                  >
                    Solflare <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center text-xs font-black">
                    2
                  </span>
                  Fondear con una pequeña fracción de SOL para gas
                </h3>
                <p className="text-slate-400">
                  En Solana, cada transacción (swap) cuesta una fracción ínfima de céntimo (aprox. 0.00005 a 0.0005 SOL). Con tener <strong>0.02 a 0.05 SOL</strong> en tu Jupiter Wallet, tendrás suficiente para cientos de operaciones de arbitraje o swaps automáticos.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center text-xs font-black">
                    3
                  </span>
                  ¿Cómo funciona el Swap en Jupiter DEX?
                </h3>
                <p className="text-slate-400">
                  Jupiter es el agregador de liquidez #1 de Solana. Busca la ruta más barata entre todos los DEXes (Raydium, Orca, Whirlpool, Meteora). Cuando ejecutas un swap en la aplicación, el contrato inteligente intercambia de inmediato tu token de origen por el destino con mínimo slippage.
                </p>
              </div>
            </div>
          )}

          {activeTab === "python" && (
            <div className="space-y-4 text-xs leading-relaxed text-slate-300">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-yellow-400" />
                  ¿Cómo opera el script en Python?
                </h3>
                <p className="text-slate-400">
                  Por diseño y seguridad, el script <code>jupiter_dex_monitor.py</code> arranca por defecto en <strong>Modo Simulación / Paper Trading</strong>. Esto te permite monitorear cotizaciones en tiempo real y probar la estrategia con $500 USD virtuales <strong>sin necesidad de ingresar claves privadas ni arriesgar fondos</strong>.
                </p>
              </div>

              <div className="space-y-2">
                <span className="font-semibold text-white block">
                  Para habilitar transacciones on-chain automáticas en Python:
                </span>
                <p className="text-slate-400">
                  Jupiter ofrece la API v6 de Swaps (<code>https://quote-api.jup.ag/v6/swap</code>). Solo requieres instalar la librería de Solana y configurar tu clave privada mediante una variable de entorno segura:
                </p>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-cyan-300 space-y-1">
                  <div># 1. Configurar dirección de Jupiter Wallet o Solana:</div>
                  <div className="text-white">$env:JUPITER_WALLET_ADDRESS="tu_direccion_publica_jupiter"</div>
                  <div className="mt-2"># 2. Instalar SDK opcional para swaps on-chain automáticos:</div>
                  <div className="text-white">pip install solders solana requests</div>
                  <div className="mt-2"># 3. Variable de clave privada para modo Real (on-chain):</div>
                  <div className="text-white">$env:SOLANA_PRIVATE_KEY="tu_private_key_base58"</div>
                  <div className="mt-2"># O en Linux / Mac:</div>
                  <div className="text-white">export JUPITER_WALLET_ADDRESS="tu_direccion_publica_jupiter"</div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Buenas prácticas de seguridad:</strong> Nunca compartas ni subas tu clave privada a repositorios públicos de GitHub. Mantén siempre una wallet dedicada exclusivamente para bots con un saldo controlado.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs">
          <div className="text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Red: <strong>Solana Mainnet-beta</strong> (Jupiter Aggregator v6)</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
