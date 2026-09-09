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
} from "lucide-react";
import {
  getOrCreateBotKeypair,
  regenerateBotKeypair,
  fetchSolBalance,
  withdrawSolToMainWallet,
  DEFAULT_FEE_COLLECTOR,
  BotKeypairData,
} from "../utils/solanaBot";
import { PlatformFeeConfig } from "../types";

interface AutonomousBotWalletCardProps {
  solPriceUsd: number;
  isLiveOnChain: boolean;
  onChangeLiveMode: (isLive: boolean) => void;
  platformFeeConfig: PlatformFeeConfig;
  onUpdateFeeConfig: (config: PlatformFeeConfig) => void;
  onKeypairLoaded: (keypair: BotKeypairData) => void;
}

export const AutonomousBotWalletCard: React.FC<AutonomousBotWalletCardProps> = ({
  solPriceUsd,
  isLiveOnChain,
  onChangeLiveMode,
  platformFeeConfig,
  onUpdateFeeConfig,
  onKeypairLoaded,
}) => {
  const [keypairData, setKeypairData] = useState<BotKeypairData>(() => getOrCreateBotKeypair());
  const [solBalance, setSolBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<"pub" | "sec" | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState<boolean>(false);
  const [showQr, setShowQr] = useState<boolean>(false);
  const [showFeeConfig, setShowFeeConfig] = useState<boolean>(false);
  const [showWithdraw, setShowWithdraw] = useState<boolean>(false);

  // Withdraw state
  const [withdrawAddress, setWithdrawAddress] = useState<string>(DEFAULT_FEE_COLLECTOR);
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [withdrawStatus, setWithdrawStatus] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    const kp = getOrCreateBotKeypair();
    setKeypairData(kp);
    onKeypairLoaded(kp);
    refreshBalance(kp.publicKey);
  }, []);

  const refreshBalance = async (pubkey = keypairData.publicKey) => {
    setIsLoadingBalance(true);
    try {
      const bal = await fetchSolBalance(pubkey);
      setSolBalance(bal);
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

  const handleRegenerate = () => {
    if (
      window.confirm(
        "¿Estás seguro de que deseas generar una nueva sub-wallet? Asegúrate de haber retirado o respaldado los fondos de la dirección actual antes de continuar."
      )
    ) {
      const newKp = regenerateBotKeypair();
      setKeypairData(newKp);
      onKeypairLoaded(newKp);
      setSolBalance(0);
      refreshBalance(newKp.publicKey);
    }
  };

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
              <h3 className="text-sm font-bold text-white">Billetera Autónoma de Trading</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/50 font-mono">
                100% Desatendido
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Sub-wallet exclusiva para que el bot firme swaps en Jupiter DEX sin intervención manual
            </p>
          </div>
        </div>

        {/* Live vs Paper Switch */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => onChangeLiveMode(false)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
              !isLiveOnChain
                ? "bg-cyan-500 text-slate-950 shadow font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            🧪 Modo Simulación
          </button>
          <button
            type="button"
            onClick={() => onChangeLiveMode(true)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-all flex items-center gap-1.5 ${
              isLiveOnChain
                ? "bg-emerald-500 text-slate-950 shadow font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            ⚡ Modo Real On-Chain
          </button>
        </div>
      </div>

      {/* Main Sub-Wallet Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Public Address & Deposit */}
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              Dirección de Depósito (Solana):
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                title="Mostrar código QR de depósito"
              >
                <QrCode className="w-3.5 h-3.5" />
                {showQr ? "Ocultar QR" : "Ver QR"}
              </button>
              <button
                type="button"
                onClick={() => handleCopy(keypairData.publicKey, "pub")}
                className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-700"
              >
                {copiedKey === "pub" ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-cyan-400" /> Copiar
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
                Escanea desde Phantom / Solflare para depositar fondos al bot
              </span>
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            💡 Deposita aquí únicamente el capital con el que deseas que opere el bot (ej. 0.5 SOL o 50 USDC).
          </p>
        </div>

        {/* Balance & Status */}
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Saldo en Sub-Wallet:</span>
            <button
              type="button"
              onClick={() => refreshBalance()}
              disabled={isLoadingBalance}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingBalance ? "animate-spin" : ""}`} />
              Refrescar
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

          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowWithdraw(!showWithdraw)}
              className="flex-1 py-1.5 px-3 rounded bg-slate-900 hover:bg-slate-800 text-xs text-slate-200 font-semibold border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5 text-cyan-400" />
              Retirar a Wallet Personal
            </button>
            <button
              type="button"
              onClick={() => setShowFeeConfig(!showFeeConfig)}
              className="py-1.5 px-2.5 rounded bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 transition-colors"
              title="Información de Transparencia de Tarifas"
            >
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              Tarifa: 0.20% (Info)
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
              Retirar Fondos de la Sub-Wallet
            </h4>
            <button
              type="button"
              onClick={() => setShowWithdraw(false)}
              className="text-xs text-slate-500 hover:text-white"
            >
              ✕ Cerrar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Dirección de destino (tu Phantom/Solflare):</label>
              <input
                type="text"
                placeholder="Ingresa tu clave pública de Solana..."
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400">Monto a retirar (SOL):</label>
                <button
                  type="button"
                  onClick={() => setWithdrawAmount(Math.max(0, solBalance - 0.005).toFixed(4))}
                  className="text-[10px] text-cyan-400 hover:underline"
                >
                  Máximo ({Math.max(0, solBalance - 0.005).toFixed(4)})
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
              {isWithdrawing ? "Procesando..." : "Confirmar Retiro Inmediato"}
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
                  Transparencia del Servicio y Tarifas
                </h4>
                <p className="text-[11px] text-slate-400">
                  Modelo justo y abierto: Análisis gratuito + comisión por swap exitoso
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowFeeConfig(false)}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-900"
            >
              ✕ Cerrar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Free Tier Info */}
            <div className="p-3 rounded bg-slate-900/80 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Datos y Cotizaciones: 100% Gratuitos</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                El acceso a las cotizaciones en vivo de Jupiter DEX, gráficas de velas, comparativa de los 5 pares principales y simulación en papel (*Paper Trading*) es <strong>totalmente gratuito y sin límites</strong>.
              </p>
            </div>

            {/* Swap Bot Fee Info */}
            <div className="p-3 rounded bg-slate-900/80 border border-emerald-900/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <Zap className="w-4 h-4" />
                  Tarifa por Swap del Bot Autónomo:
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 font-mono font-bold">
                  0.20% (20 bps)
                </span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Al activar el bot autónomo, Jupiter DEX aplica una comisión transparente de <strong>0.20%</strong> sobre cada swap ejecutado con éxito. Solo se cobra si el bot genera una rotación con ganancia neta.
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded bg-slate-900/50 border border-slate-800 flex items-center justify-between text-slate-400 text-[11px]">
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              Tesorería del protocolo auditada y fijada contractualmente en la red de Solana
            </span>
            <span className="font-mono text-emerald-400 font-semibold">
              {platformFeeConfig.totalSwapsMonetized} rotaciones ejecutadas
            </span>
          </div>
        </div>
      )}

      {/* Security & Private Key Export Bar */}
      <div className="flex flex-wrap items-center justify-between text-xs pt-1 text-slate-400 gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPrivateKey(!showPrivateKey)}
            className="text-slate-400 hover:text-amber-300 flex items-center gap-1 text-[11px]"
          >
            {showPrivateKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showPrivateKey ? "Ocultar Clave Privada" : "Exportar Clave Privada (Base58)"}
          </button>
          <span className="text-slate-700">•</span>
          <button
            type="button"
            onClick={handleRegenerate}
            className="text-slate-500 hover:text-rose-400 text-[11px]"
          >
            Regenerar Sub-Wallet
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Firma local en cliente sin custodia de servidor</span>
        </div>
      </div>

      {showPrivateKey && (
        <div className="bg-amber-950/40 p-3 rounded-lg border border-amber-800/50 space-y-2">
          <div className="flex items-center justify-between text-xs text-amber-300 font-semibold">
            <span className="flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Clave Privada de la Sub-Wallet:
            </span>
            <button
              type="button"
              onClick={() => handleCopy(keypairData.secretKeyBase58, "sec")}
              className="text-[11px] text-amber-200 bg-amber-900/60 px-2 py-0.5 rounded border border-amber-700 flex items-center gap-1"
            >
              {copiedKey === "sec" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copiedKey === "sec" ? "Copiada" : "Copiar Clave Privada"}
            </button>
          </div>
          <div className="font-mono text-xs text-amber-100 bg-slate-950 p-2 rounded border border-amber-900/50 break-all select-all">
            {keypairData.secretKeyBase58}
          </div>
          <p className="text-[10px] text-amber-400">
            ⚠️ No compartas esta clave con nadie. Puedes importarla en Phantom o Solflare cuando quieras para tener acceso directo y control total de tus fondos.
          </p>
        </div>
      )}
    </div>
  );
};
