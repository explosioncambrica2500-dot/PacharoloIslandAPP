import React, { useState, useEffect } from "react";
import {
  Key,
  Copy,
  Check,
  RefreshCw,
  QrCode,
  ArrowUpRight,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  DollarSign,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Send,
  Zap,
  PlusCircle,
  Download,
  KeyRound,
  CheckCircle2,
  Coins,
} from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import {
  getOrCreateBotKeypair,
  regenerateBotKeypair,
  importBotKeypair,
  validatePrivateKey,
  fetchSolBalance,
  withdrawSolToMainWallet,
  DEFAULT_FEE_COLLECTOR,
  BotKeypairData,
  WALLET_UPDATED_EVENT,
  checkCreatorWalletStatus,
  activateCreatorWalletOnChain,
  CreatorWalletStatus,
  getPendingCreatorFeeLamports,
  checkEmptyTokenAccounts,
  reclaimRentFromEmptyAccounts,
} from "../utils/solanaBot";
import { PlatformFeeConfig, WalletConfig } from "../types";
import { useLanguage } from "../utils/i18n";

interface AutonomousBotWalletCardProps {
  solPriceUsd: number;
  isLiveOnChain: boolean;
  onChangeLiveMode: (isLive: boolean) => void;
  platformFeeConfig: PlatformFeeConfig;
  onUpdateFeeConfig: (config: PlatformFeeConfig) => void;
  onKeypairLoaded?: (keypair: BotKeypairData) => void;
  onUpdateWalletConfig?: (config: WalletConfig) => void;
  onBalanceUpdated?: (balanceSol: number) => void;
  walletConfig?: WalletConfig;
}

export const AutonomousBotWalletCard: React.FC<AutonomousBotWalletCardProps> = ({
  solPriceUsd,
  isLiveOnChain,
  onChangeLiveMode,
  platformFeeConfig,
  onUpdateFeeConfig,
  onKeypairLoaded,
  onUpdateWalletConfig,
  onBalanceUpdated,
  walletConfig,
}) => {
  const { t } = useLanguage();
  const [keypairData, setKeypairData] = useState<BotKeypairData>(() => getOrCreateBotKeypair());
  const [solBalance, setSolBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<"pub" | "sec" | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState<boolean>(false);
  const [showQr, setShowQr] = useState<boolean>(false);
  const [showFeeConfig, setShowFeeConfig] = useState<boolean>(false);
  const [showWithdraw, setShowWithdraw] = useState<boolean>(false);

  // New Wallet creation confirmation & Import states
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState<boolean>(false);
  const [showImportPanel, setShowImportPanel] = useState<boolean>(false);
  const [importKeyInput, setImportKeyInput] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Withdraw state
  const [withdrawAddress, setWithdrawAddress] = useState<string>(DEFAULT_FEE_COLLECTOR);
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [withdrawStatus, setWithdrawStatus] = useState<string | null>(null);

  // Creator Fee Wallet On-Chain Status & Activation state
  const [creatorStatus, setCreatorStatus] = useState<CreatorWalletStatus | null>(null);
  const [isCheckingCreator, setIsCheckingCreator] = useState<boolean>(false);
  const [isActivatingCreator, setIsActivatingCreator] = useState<boolean>(false);
  const [creatorActivationError, setCreatorActivationError] = useState<string | null>(null);
  const [creatorActivationSuccess, setCreatorActivationSuccess] = useState<string | null>(null);
  const [isEditingFeeAddress, setIsEditingFeeAddress] = useState<boolean>(false);
  const [customFeeAddressInput, setCustomFeeAddressInput] = useState<string>(platformFeeConfig.feeCollectorAddress);
  const [feeAddressError, setFeeAddressError] = useState<string | null>(null);
  const [lastFeeTxHash, setLastFeeTxHash] = useState<string | null>(null);

  const refreshCreatorStatus = async (address = platformFeeConfig.feeCollectorAddress) => {
    setIsCheckingCreator(true);
    try {
      const status = await checkCreatorWalletStatus(address);
      setCreatorStatus(status);
    } catch (err) {
      console.warn("Could not check creator wallet status:", err);
    } finally {
      setIsCheckingCreator(false);
    }
  };

  const handleActivateCreatorWallet = async () => {
    if (isActivatingCreator) return;
    setIsActivatingCreator(true);
    setCreatorActivationError(null);
    setCreatorActivationSuccess(null);
    try {
      const res = await activateCreatorWalletOnChain({
        secretKeyBase58: keypairData.secretKeyBase58,
        creatorWalletAddress: platformFeeConfig.feeCollectorAddress,
      });
      if (res.success && res.txHash) {
        setCreatorActivationSuccess(`¡Wallet activada en Solana Mainnet! Tx: ${res.txHash.substring(0, 10)}...`);
        setActionSuccessMessage("Wallet del Creador activada y exenta de renta en Solana.");
        await Promise.all([
          refreshBalance(keypairData.publicKey),
          refreshCreatorStatus(platformFeeConfig.feeCollectorAddress),
        ]);
      } else {
        setCreatorActivationError(res.error || "No se pudo activar la wallet.");
      }
    } catch (err: any) {
      setCreatorActivationError(err?.message || "Error al activar la wallet en Solana.");
    } finally {
      setIsActivatingCreator(false);
    }
  };

  const handleSaveCustomFeeAddress = () => {
    const trimmed = customFeeAddressInput.trim();
    if (!trimmed) {
      setFeeAddressError("Ingresa una dirección válida.");
      return;
    }
    try {
      new PublicKey(trimmed);
    } catch {
      setFeeAddressError("Dirección de Solana inválida.");
      return;
    }

    setFeeAddressError(null);
    onUpdateFeeConfig({
      ...platformFeeConfig,
      feeCollectorAddress: trimmed,
    });
    setIsEditingFeeAddress(false);
    setActionSuccessMessage("Dirección de cobro de comisiones actualizada.");
    refreshCreatorStatus(trimmed);
  };

  const handleUpdateFeeCollector = (newAddress: string) => {
    const trimmed = newAddress.trim();
    if (!trimmed) return;
    try {
      new PublicKey(trimmed);
    } catch {
      return;
    }
    onUpdateFeeConfig({
      ...platformFeeConfig,
      feeCollectorAddress: trimmed,
    });
    refreshCreatorStatus(trimmed);
  };

  // Initial load & periodic balance polling
  useEffect(() => {
    const kp = getOrCreateBotKeypair();
    setKeypairData(kp);
    onKeypairLoaded(kp);
    refreshBalance(kp.publicKey);
    refreshCreatorStatus(platformFeeConfig.feeCollectorAddress);

    // Auto-consultar balance cada 15 segundos para detectar depósitos automáticamente
    const interval = setInterval(() => {
      refreshBalance(kp.publicKey);
      refreshCreatorStatus(platformFeeConfig.feeCollectorAddress);
    }, 15000);
    return () => clearInterval(interval);
  }, [platformFeeConfig.feeCollectorAddress]);

  // Listen for wallet updates dispatched anywhere in the app
  useEffect(() => {
    const handleWalletUpdate = (e: any) => {
      if (e.detail?.publicKey && e.detail?.secretKeyBase58) {
        setKeypairData(e.detail);
        onKeypairLoaded(e.detail);
        refreshBalance(e.detail.publicKey);
      }
    };
    window.addEventListener(WALLET_UPDATED_EVENT, handleWalletUpdate);
    return () => window.removeEventListener(WALLET_UPDATED_EVENT, handleWalletUpdate);
  }, []);

  // Listen for creator fee updates dispatched after any swap
  useEffect(() => {
    const handleFeeUpdate = (e: any) => {
      refreshCreatorStatus(platformFeeConfig.feeCollectorAddress);
      if (e.detail?.feeTxHash) {
        setLastFeeTxHash(e.detail.feeTxHash);
      }
    };
    window.addEventListener("creator_fee_updated", handleFeeUpdate);
    return () => window.removeEventListener("creator_fee_updated", handleFeeUpdate);
  }, [platformFeeConfig.feeCollectorAddress]);

  const [emptyAccountsData, setEmptyAccountsData] = useState<{ count: number; reclaimableSol: number } | null>(null);
  const [isReclaimingRent, setIsReclaimingRent] = useState(false);
  const [reclaimRentMessage, setReclaimRentMessage] = useState<string | null>(null);

  const checkEmptyAccounts = async (address = keypairData.publicKey) => {
    try {
      const res = await checkEmptyTokenAccounts(address);
      setEmptyAccountsData({ count: res.count, reclaimableSol: res.reclaimableSol });
    } catch {}
  };

  const handleReclaimRent = async () => {
    setIsReclaimingRent(true);
    setReclaimRentMessage(null);
    try {
      const res = await reclaimRentFromEmptyAccounts(keypairData.secretKeyBase58);
      if (res.success && res.reclaimedSol > 0) {
        setReclaimRentMessage(`✓ ¡Recuperados +${res.reclaimedSol.toFixed(5)} SOL a la sub-wallet!`);
        refreshBalance();
        checkEmptyAccounts();
        setTimeout(() => setReclaimRentMessage(null), 6000);
      } else if (res.success) {
        setReclaimRentMessage("No hay cuentas vacías pendientes por reclamar.");
        setTimeout(() => setReclaimRentMessage(null), 3000);
      } else {
        setReclaimRentMessage(`Error: ${res.error || "No se pudo recuperar la renta"}`);
      }
    } catch (err: any) {
      setReclaimRentMessage(`Error: ${err?.message || "Fallo inesperado"}`);
    } finally {
      setIsReclaimingRent(false);
    }
  };

  const refreshBalance = async (pubkey = keypairData.publicKey) => {
    setIsLoadingBalance(true);
    try {
      const bal = await fetchSolBalance(pubkey);
      setSolBalance(bal);
      if (onBalanceUpdated) {
        onBalanceUpdated(bal);
      }
      checkEmptyAccounts(pubkey);
    } catch (e) {
      console.warn("Could not query balance:", e);
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const handleCopy = (text: string, type: "pub" | "sec") => {
    navigator.clipboard.writeText(text);
    setCopiedKey(type);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const showNotification = (msg: string) => {
    setActionSuccessMessage(msg);
    setTimeout(() => setActionSuccessMessage(null), 4000);
  };

  const handleConfirmRegenerate = () => {
    const newKp = regenerateBotKeypair();
    setKeypairData(newKp);
    onKeypairLoaded(newKp);
    setSolBalance(0);
    setShowRegenerateConfirm(false);
    showNotification(t("generateWalletSuccess"));
    refreshBalance(newKp.publicKey);
    if (onUpdateWalletConfig) {
      onUpdateWalletConfig({
        mode: "REAL",
        address: newKp.publicKey,
        providerName: "Solana Wallet",
        isConnected: true,
        paperBalanceUsd: 0,
      });
    }
  };

  const handleExecuteImport = () => {
    setImportError(null);
    const result = importBotKeypair(importKeyInput);
    if (!result.success || !result.data) {
      setImportError(result.error || "No se pudo importar la clave privada.");
      return;
    }

    setKeypairData(result.data);
    onKeypairLoaded(result.data);
    setImportKeyInput("");
    setShowImportPanel(false);
    showNotification(t("importWalletSuccess"));
    refreshBalance(result.data.publicKey);
    if (onUpdateWalletConfig) {
      onUpdateWalletConfig({
        mode: "REAL",
        address: result.data.publicKey,
        providerName: "Solana Wallet",
        isConnected: true,
        paperBalanceUsd: 0,
      });
    }
  };

  // Real-time validation for imported key
  const validationResult = importKeyInput.trim() ? validatePrivateKey(importKeyInput) : null;

  const handleWithdraw = async () => {
    if (!withdrawAddress || !withdrawAmount) {
      setWithdrawStatus("Por favor ingresa la dirección de destino y el monto a retirar.");
      return;
    }
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawStatus("Monto inválido.");
      return;
    }
    if (amount > solBalance) {
      setWithdrawStatus("Saldo insuficiente en la sub-wallet.");
      return;
    }

    setIsWithdrawing(true);
    setWithdrawStatus("Enviando transacción a la red de Solana...");
    try {
      const res = await withdrawSolToMainWallet(
        keypairData.secretKeyBase58,
        withdrawAddress.trim(),
        amount
      );
      if (res.success) {
        setWithdrawStatus(`✓ Retiro completado exitosamente. Tx: ${res.txHash?.substring(0, 16)}...`);
        setWithdrawAmount("");
        refreshBalance();
      } else {
        setWithdrawStatus(`Error al retirar: ${res.error}`);
      }
    } catch (err: any) {
      setWithdrawStatus(`Error: ${err?.message || "Fallo en la red."}`);
    } finally {
      setIsWithdrawing(false);
    }
  };

  const totalBalanceUsd = solBalance * solPriceUsd;

  return (
    <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 space-y-4">
      {/* Header & Mode Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-700/50 flex items-center justify-center text-cyan-400">
            <Key className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">{t("botTitle")}</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/50 font-mono">
                {t("botBadge")}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {t("botDesc")}
            </p>
          </div>
        </div>

        {/* Live Mode Indicator */}
        <div className="flex items-center gap-2 bg-emerald-950/70 border border-emerald-800/60 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-300 font-mono shadow-sm self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span>{t("liveMode")} (Solana Mainnet)</span>
        </div>
      </div>

      {/* Quick notice when creator fee wallet needs rent activation on Solana */}
      {creatorStatus && !creatorStatus.isRentExempt && (
        <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Wallet de comisiones del creador inactiva (0 SOL):</strong> Requiere rent-exemption para recibir micro-tarifas.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleActivateCreatorWallet}
              disabled={isActivatingCreator || solBalance < 0.0009}
              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              title={solBalance < 0.0009 ? "Se requiere al menos 0.0009 SOL en la sub-wallet" : "Activa la wallet con saldo de renta"}
            >
              {isActivatingCreator ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Activando...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3 h-3 fill-current" />
                  <span>Activar ahora (0.00085 SOL)</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowFeeConfig(true)}
              className="text-amber-300 hover:text-white underline text-xs"
            >
              Configurar
            </button>
          </div>
        </div>
      )}

      {/* Main Sub-Wallet Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Public Address & Deposit */}
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              {t("depositAddress")}:
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                title="Mostrar código QR de depósito"
              >
                <QrCode className="w-3.5 h-3.5" />
                {showQr ? t("hideQr") : t("showQr")}
              </button>
              <button
                type="button"
                onClick={() => handleCopy(keypairData.publicKey, "pub")}
                className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-700"
              >
                {copiedKey === "pub" ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" /> {t("copied")}
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-cyan-400" /> {t("copy")}
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="font-mono text-xs text-white bg-slate-900/90 p-2 rounded border border-slate-800 break-all select-all">
            {keypairData.publicKey}
          </div>

          {showQr && (
            <div className="p-3 bg-white rounded-lg flex flex-col items-center justify-center space-y-1 my-2">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${keypairData.publicKey}&bgcolor=ffffff`}
                alt="Deposit QR"
                className="w-32 h-32"
              />
              <span className="text-[10px] text-slate-700 font-mono text-center">
                {t("qrInstructions")}
              </span>
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            {t("depositHint")}
          </p>
        </div>

        {/* Balance & Status */}
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">{t("balanceInWallet")}:</span>
            <button
              type="button"
              onClick={() => refreshBalance()}
              disabled={isLoadingBalance}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingBalance ? "animate-spin" : ""}`} />
              {t("refresh")}
            </button>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-white">
              {solBalance.toFixed(4)} SOL
            </span>
            <span className="text-xs text-slate-400 font-mono">
              ≈ ${totalBalanceUsd.toFixed(2)} USD
            </span>
          </div>

          {isLiveOnChain && solBalance < 0.005 && (
            <div className="p-2 rounded bg-amber-950/40 border border-amber-600/40 text-[11px] text-amber-300 flex items-start gap-1.5 leading-snug">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong className="font-semibold text-amber-200">Modo Real activo en Solana Mainnet:</strong> Tu sub-wallet tiene {solBalance.toFixed(4)} SOL. Para que el bot ejecute swaps reales on-chain en Jupiter, deposita saldo y al menos ~0.005 SOL para tarifas de red.
              </span>
            </div>
          )}

          {emptyAccountsData && emptyAccountsData.count > 0 && (
            <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-[11px] text-emerald-200 flex items-center justify-between gap-2 shadow-sm">
              <div className="flex items-start gap-1.5 min-w-0">
                <Coins className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-emerald-300">
                    +{emptyAccountsData.reclaimableSol.toFixed(5)} SOL de renta recuperable
                  </div>
                  <div className="text-[10px] text-emerald-300/80 truncate">
                    {emptyAccountsData.count} cuenta(s) de token vacía(s) de rotaciones previas.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleReclaimRent}
                disabled={isReclaimingRent}
                className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded shadow transition-colors flex items-center gap-1 shrink-0"
              >
                {isReclaimingRent ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 fill-current" />}
                {isReclaimingRent ? "Recuperando..." : "Recuperar Gas"}
              </button>
            </div>
          )}

          {reclaimRentMessage && (
            <div className="text-[11px] text-emerald-400 font-medium px-1">
              {reclaimRentMessage}
            </div>
          )}

          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowWithdraw(!showWithdraw)}
              className="flex-1 py-1.5 px-3 rounded bg-slate-900 hover:bg-slate-800 text-xs text-slate-200 font-semibold border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5 text-cyan-400" />
              {t("withdrawToPersonal")}
            </button>
            <button
              type="button"
              onClick={() => setShowFeeConfig(!showFeeConfig)}
              className="py-1.5 px-2.5 rounded bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 transition-colors"
              title="Información de Transparencia de Tarifas"
            >
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              {t("feeInfoBtn")}
            </button>
          </div>
        </div>
      </div>

      {/* Withdraw Drawer */}
      {showWithdraw && (
        <div className="bg-slate-950 p-3.5 rounded-lg border border-cyan-800/40 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-cyan-400" />
              {t("withdrawTitle")}
            </h4>
            <button
              type="button"
              onClick={() => setShowWithdraw(false)}
              className="text-xs text-slate-500 hover:text-white"
            >
              ✕ {t("close")}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">{t("destinationWallet")}</label>
              <input
                type="text"
                placeholder="Solana address..."
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400">{t("amountToWithdraw")}</label>
                <button
                  type="button"
                  onClick={() => setWithdrawAmount(Math.max(0, solBalance - 0.005).toFixed(4))}
                  className="text-[10px] text-cyan-400 hover:underline"
                >
                  {t("max")} ({Math.max(0, solBalance - 0.005).toFixed(4)})
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {withdrawStatus && (
            <div className="text-xs font-mono p-2 rounded bg-slate-900 border border-slate-800 text-slate-300">
              {withdrawStatus}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={isWithdrawing || solBalance <= 0}
              className="px-4 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs disabled:opacity-50 transition-colors"
            >
              {isWithdrawing ? t("processing") : t("confirmWithdraw")}
            </button>
          </div>
        </div>
      )}

      {/* Platform Fee & Transparency Information (Non-editable, Locked Protocol Fee) */}
      {showFeeConfig && (
        <div className="bg-slate-950 p-4 rounded-lg border border-emerald-800/40 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-emerald-400">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">
                  {t("transparencyTitle")}
                </h4>
                <p className="text-[11px] text-slate-400">
                  {t("transparencyDesc")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowFeeConfig(false)}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-900"
            >
              ✕ {t("close")}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Free Tier Info */}
            <div className="p-3 rounded bg-slate-900/80 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>{t("dataFreeTitle")}</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                {t("dataFreeDesc")}
              </p>
            </div>

            {/* Swap Bot Fee Info */}
            <div className="p-3 rounded bg-slate-900/80 border border-emerald-900/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <Zap className="w-4 h-4" />
                  {t("feeSwapTitle")}:
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 font-mono font-bold">
                  0.15% (15 bps)
                </span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                {t("feeSwapDesc")}
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded bg-slate-900/50 border border-slate-800 flex items-center justify-between text-slate-400 text-[11px]">
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              {t("auditedTreasury")}
            </span>
            <span className="font-mono text-emerald-400 font-semibold">
              {platformFeeConfig.totalSwapsMonetized} {t("swapsMonetizedCount")}
            </span>
          </div>

          {/* Creator Wallet On-Chain Status & Activation Panel */}
          <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2.5 pt-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                Wallet Receptora de Comisiones (Creador):
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => refreshCreatorStatus()}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                  title="Actualizar estado on-chain"
                  disabled={isCheckingCreator}
                >
                  <RefreshCw className={`w-3 h-3 ${isCheckingCreator ? "animate-spin text-cyan-400" : ""}`} />
                  <span>Refrescar</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingFeeAddress(!isEditingFeeAddress);
                    setCustomFeeAddressInput(platformFeeConfig.feeCollectorAddress);
                    setFeeAddressError(null);
                  }}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 underline"
                >
                  {isEditingFeeAddress ? "Cancelar" : "Cambiar dirección"}
                </button>
              </div>
            </div>

            {/* Address Display or Edit Form */}
            {isEditingFeeAddress ? (
              <div className="space-y-1.5 bg-slate-950 p-2 rounded border border-slate-700">
                <label className="text-[10px] text-slate-400">Nueva dirección Solana (ej. tu wallet Phantom personal):</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customFeeAddressInput}
                    onChange={(e) => setCustomFeeAddressInput(e.target.value)}
                    placeholder="Dirección pública Base58..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveCustomFeeAddress}
                    className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded text-xs"
                  >
                    Guardar
                  </button>
                </div>
                {feeAddressError && <p className="text-rose-400 text-[10px]">{feeAddressError}</p>}
              </div>
            ) : (
              <div className="flex items-center justify-between bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-xs">
                <span className="font-mono text-slate-300 truncate max-w-[220px] sm:max-w-none">
                  {platformFeeConfig.feeCollectorAddress}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(platformFeeConfig.feeCollectorAddress, "pub")}
                    className="text-slate-400 hover:text-white p-1"
                    title="Copiar dirección"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={`https://solscan.io/account/${platformFeeConfig.feeCollectorAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 p-1"
                    title="Ver en Solscan"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}

            {/* Quick Option to use Connected User Wallet as Fee Collector */}
            {walletConfig?.address && walletConfig.address !== platformFeeConfig.feeCollectorAddress && (
              <div className="flex items-center justify-between px-1 text-[11px]">
                <span className="text-slate-400">¿Deseas recibir las tarifas en tu propia wallet?</span>
                <button
                  type="button"
                  onClick={() => {
                    handleUpdateFeeCollector(walletConfig.address);
                    refreshCreatorStatus(walletConfig.address);
                    setActionSuccessMessage(`Dirección de comisiones actualizada a tu wallet conectada: ${walletConfig.address.slice(0, 4)}...${walletConfig.address.slice(-4)}`);
                  }}
                  className="text-cyan-400 hover:text-cyan-300 underline font-mono text-[10px] flex items-center gap-1"
                >
                  <span>Usar mi wallet ({walletConfig.address.slice(0, 4)}...{walletConfig.address.slice(-4)})</span>
                </button>
              </div>
            )}

            {/* Last On-Chain Fee Transaction Link */}
            {lastFeeTxHash && (
              <div className="flex items-center justify-between text-[11px] bg-amber-950/30 px-2.5 py-1.5 rounded border border-amber-800/40 text-amber-200">
                <span className="flex items-center gap-1 font-medium">
                  <Zap className="w-3 h-3 text-amber-400" />
                  Última tarifa enviada on-chain:
                </span>
                <a
                  href={`https://solscan.io/tx/${lastFeeTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 hover:text-amber-200 underline font-mono text-[10px] flex items-center gap-1"
                >
                  <span>{lastFeeTxHash.slice(0, 6)}...{lastFeeTxHash.slice(-4)}</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            )}

            {/* Status & Rent-Exemption Warning */}
            {creatorStatus?.isRentExempt ? (
              <div className="p-2.5 rounded bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Cuenta Activa en Solana Mainnet</strong> (Saldo: {creatorStatus.balanceSol.toFixed(4)} SOL). Exenta de renta: las comisiones se acreditan instantáneamente en cada swap.
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded bg-amber-950/50 border border-amber-800/70 text-amber-200 text-[11px] space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-amber-300">Cuenta Inactiva en Solana (0 SOL - Solscan "Closed Account")</strong>
                    <p className="text-slate-300 text-[10px] mt-0.5 leading-relaxed">
                      En Solana, las cuentas con 0 SOL no pueden recibir transferencias menores a <strong>0.00082 SOL</strong> (regla de rent-exemption). Por eso las micro-comisiones del bot daban error de renta en la red.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-900/50">
                  <span className="text-[10px] text-amber-300/90">
                    Comisiones acumuladas en cola: <strong>{(creatorStatus?.pendingFeeSol || 0).toFixed(6)} SOL</strong> (${(((creatorStatus?.pendingFeeSol || 0)) * (solPriceUsd || 105)).toFixed(3)} USD)
                  </span>

                  <button
                    type="button"
                    onClick={handleActivateCreatorWallet}
                    disabled={isActivatingCreator || solBalance < 0.0009}
                    className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    {isActivatingCreator ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Activando en Solana...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3 h-3 fill-current" />
                        <span>Activar Wallet ahora (0.00085 SOL)</span>
                      </>
                    )}
                  </button>
                </div>

                {creatorActivationSuccess && (
                  <p className="text-emerald-400 text-[10px] font-semibold">{creatorActivationSuccess}</p>
                )}
                {creatorActivationError && (
                  <p className="text-rose-400 text-[10px]">{creatorActivationError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Success Toast */}
      {actionSuccessMessage && (
        <div className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{actionSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-400 hover:text-white text-xs px-2 py-0.5 rounded bg-emerald-900/60"
          >
            ✕
          </button>
        </div>
      )}

      {/* Confirmation Dialog: Regenerate/Create New Wallet */}
      {showRegenerateConfirm && (
        <div className="bg-rose-950/40 p-3.5 rounded-xl border border-rose-800/60 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-white">{t("confirmRegenerateTitle")}</h4>
              <p className="text-[11px] text-rose-200 leading-relaxed">
                {t("confirmRegenerateDesc")}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowRegenerateConfirm(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirmRegenerate}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-md transition-colors flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              {t("confirmRegenerateBtn")}
            </button>
          </div>
        </div>
      )}

      {/* Import Private Key Panel */}
      {showImportPanel && (
        <div className="bg-slate-950 p-4 rounded-xl border border-cyan-700/60 space-y-3 animate-in fade-in duration-150 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold text-white">{t("importPrivateKey")}</h4>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowImportPanel(false);
                setImportError(null);
              }}
              className="text-slate-500 hover:text-white text-xs px-2 py-0.5 rounded bg-slate-900"
            >
              ✕ {t("cancel")}
            </button>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            {t("importWalletDesc")}
          </p>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-300 block">
              {t("enterPrivateKey")}
            </label>
            <textarea
              rows={2}
              value={importKeyInput}
              onChange={(e) => {
                setImportKeyInput(e.target.value);
                setImportError(null);
              }}
              placeholder="Pega aquí tu clave privada Base58 (ej. 4vJUP... o array [12, 45, ...])"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-500 transition-colors resize-none placeholder-slate-600"
            />
          </div>

          {/* Validation Feedback */}
          {validationResult && (
            <div
              className={`p-2 rounded-lg text-xs flex items-center gap-2 ${
                validationResult.valid
                  ? "bg-emerald-950/60 border border-emerald-700/50 text-emerald-300"
                  : "bg-rose-950/60 border border-rose-800/50 text-rose-300"
              }`}
            >
              {validationResult.valid ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="truncate">
                    <span className="font-semibold">✓ Clave válida.</span> Dirección:{" "}
                    <span className="font-mono text-white">
                      {validationResult.publicKey?.substring(0, 8)}...
                      {validationResult.publicKey?.substring(validationResult.publicKey.length - 8)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{validationResult.error}</span>
                </>
              )}
            </div>
          )}

          {importError && (
            <p className="text-xs text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {importError}
            </p>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              {t("securityGuarantee")}
            </span>
            <button
              type="button"
              disabled={!validationResult?.valid}
              onClick={handleExecuteImport}
              className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs shadow-md transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              {t("confirmImport")}
            </button>
          </div>
        </div>
      )}

      {/* Security & Private Key Export Bar */}
      <div className="flex flex-wrap items-center justify-between text-xs pt-1 text-slate-400 gap-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setShowPrivateKey(!showPrivateKey)}
            className="text-slate-400 hover:text-amber-300 flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:bg-slate-800 transition-colors"
          >
            {showPrivateKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showPrivateKey ? t("hidePrivateKey") : t("exportPrivateKey")}
          </button>
          <span className="text-slate-700">•</span>
          <button
            type="button"
            onClick={() => setShowRegenerateConfirm(true)}
            className="text-slate-400 hover:text-rose-300 flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:bg-slate-800 transition-colors"
          >
            <PlusCircle className="w-3 h-3 text-rose-400" />
            {t("createNewWallet")}
          </button>
          <span className="text-slate-700">•</span>
          <button
            type="button"
            onClick={() => {
              setShowImportPanel(!showImportPanel);
              setImportError(null);
            }}
            className="text-slate-400 hover:text-cyan-300 flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:bg-slate-800 transition-colors"
          >
            <KeyRound className="w-3 h-3 text-cyan-400" />
            {t("importPrivateKey")}
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>{t("securityGuarantee")}</span>
        </div>
      </div>

      {showPrivateKey && (
        <div className="bg-amber-950/40 p-3 rounded-lg border border-amber-800/50 space-y-2">
          <div className="flex items-center justify-between text-xs text-amber-300 font-semibold">
            <span className="flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Clave Privada (Secret Key):
            </span>
            <button
              type="button"
              onClick={() => handleCopy(keypairData.secretKeyBase58, "sec")}
              className="text-[11px] text-amber-200 bg-amber-900/60 px-2 py-0.5 rounded border border-amber-700 flex items-center gap-1"
            >
              {copiedKey === "sec" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copiedKey === "sec" ? t("copied") : t("copy")}
            </button>
          </div>
          <div className="font-mono text-xs text-amber-100 bg-slate-950 p-2 rounded border border-amber-900/50 break-all select-all">
            {keypairData.secretKeyBase58}
          </div>
          <p className="text-[10px] text-amber-400">
            {t("privateKeyWarning")}
          </p>
        </div>
      )}
    </div>
  );
};
