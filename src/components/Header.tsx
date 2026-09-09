import React, { useState, useRef, useEffect } from "react";
import {
  Activity,
  RefreshCw,
  Volume2,
  VolumeX,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Smartphone,
  Globe,
  ChevronDown,
} from "lucide-react";
import { WalletConfig } from "../types";
import { IslandCastleLogo } from "./IslandCastleLogo";
import { useLanguage, SUPPORTED_LANGUAGES, AppLanguage } from "../utils/i18n";

interface HeaderProps {
  latencyMs: number;
  isPolling: boolean;
  pollInterval: number;
  setPollInterval: (interval: number) => void;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  lastUpdated: string | null;
  soundEnabled: boolean;
  onToggleSound: () => void;
  browserNotificationsEnabled: boolean;
  onRequestBrowserNotification: () => void;
  apiError: string | null;
  walletConfig: WalletConfig;
  onOpenWalletModal: () => void;
  onOpenAndroidModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  latencyMs,
  isPolling,
  pollInterval,
  setPollInterval,
  onManualRefresh,
  isRefreshing,
  lastUpdated,
  soundEnabled,
  onToggleSound,
  browserNotificationsEnabled,
  onRequestBrowserNotification,
  apiError,
  walletConfig,
  onOpenWalletModal,
  onOpenAndroidModal,
}) => {
  const { lang, setLang, t } = useLanguage();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0];

  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3 transition-colors">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3.5">
        {/* Branding & Island Castle Logo */}
        <div className="flex items-center gap-3">
          <div className="relative group cursor-pointer" title="Pacharolo Island Bot - Castillo sobre la Isla">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-500 via-emerald-400 to-amber-300 p-0.5 shadow-lg shadow-cyan-500/25 transition-transform group-hover:scale-105">
              <div className="w-full h-full rounded-[14px] overflow-hidden bg-slate-950 flex items-center justify-center">
                <IslandCastleLogo size={42} className="w-full h-full object-cover" />
              </div>
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-slate-950"></span>
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-white tracking-tight flex items-center gap-1.5 font-sans">
                {t("appName")}
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-950 to-cyan-950 text-emerald-300 border border-emerald-700/60 shadow-xs">
                  {t("tagline")}
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span>{t("appSubtitle")}</span>
            </p>
          </div>
        </div>

        {/* Live Controls & Telemetry */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Multi-Language Selector Dropdown */}
          <div className="relative" ref={langMenuRef}>
            <button
              type="button"
              id="language-selector-button"
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
              title="Seleccionar idioma / Select language / 选择语言"
            >
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>{currentLangObj.flag}</span>
              <span className="hidden sm:inline font-mono">{currentLangObj.code.toUpperCase()}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {langMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-slate-900 border border-slate-700 shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800">
                  Idiomas / Languages
                </div>
                {SUPPORTED_LANGUAGES.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      setLang(item.code);
                      setLangMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                      lang === item.code
                        ? "bg-cyan-500/15 text-cyan-300 font-semibold"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base leading-none">{item.flag}</span>
                      <span>{item.label}</span>
                    </span>
                    {lang === item.code && <span className="text-cyan-400 text-xs">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status & Latency Badge */}
          <div
            id="latency-badge"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono"
            title="Latencia estimada con Jupiter API"
          >
            <span className="relative flex h-2 w-2">
              {isPolling && !apiError ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </>
              ) : apiError ? (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500"></span>
              )}
            </span>
            <span className="text-slate-300">
              {apiError ? t("cacheMode") : isPolling ? t("live") : t("paused")}
            </span>
            <span className="text-slate-600">|</span>
            <span
              className={`font-semibold ${
                latencyMs < 200
                  ? "text-emerald-400"
                  : latencyMs < 800
                  ? "text-cyan-400"
                  : "text-amber-400"
              }`}
            >
              {latencyMs > 0 ? `${latencyMs}ms` : "--"}
            </span>
          </div>

          {/* Refresh Frequency Selector */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs text-slate-300">
            <span className="px-2 text-slate-400 font-medium hidden sm:inline">{t("interval")}:</span>
            {[
              { label: "1s", val: 1000 },
              { label: "2s", val: 2000 },
              { label: "5s", val: 5000 },
              { label: t("pause"), val: 0 },
            ].map((opt) => (
              <button
                key={opt.label}
                id={`interval-btn-${opt.label}`}
                onClick={() => setPollInterval(opt.val)}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  pollInterval === opt.val
                    ? "bg-cyan-500 text-slate-950 font-semibold shadow-sm"
                    : "hover:text-white hover:bg-slate-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Manual Refresh Button */}
          <button
            id="manual-refresh-button"
            onClick={onManualRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white disabled:opacity-50 transition-colors"
            title={t("refreshTooltip")}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
          </button>

          {/* Sound Toggle */}
          <button
            id="sound-toggle-button"
            onClick={onToggleSound}
            className={`p-2 rounded-lg border transition-colors ${
              soundEnabled
                ? "bg-slate-900 border-slate-800 text-cyan-400 hover:border-cyan-700"
                : "bg-slate-900/50 border-slate-800/60 text-slate-500 hover:text-slate-400"
            }`}
            title={soundEnabled ? t("soundOn") : t("soundOff")}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Wallet Trigger Button */}
          <button
            id="open-wallet-modal-button"
            onClick={onOpenWalletModal}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              walletConfig.isConnected
                ? walletConfig.providerName === "Jupiter Wallet"
                  ? "bg-gradient-to-r from-emerald-950/60 to-cyan-950/60 text-cyan-300 border-cyan-700/60 hover:border-cyan-500"
                  : "bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-950/60"
                : "bg-slate-900 text-slate-200 border-slate-800 hover:border-slate-700"
            }`}
            title="Configuración de Wallet Solana (Jupiter Wallet, Phantom, Solflare)"
          >
            {walletConfig.providerName === "Jupiter Wallet" ? (
              <span className="text-xs">🪐</span>
            ) : (
              <Wallet className={`w-3.5 h-3.5 ${walletConfig.isConnected ? "text-emerald-400" : "text-cyan-400"}`} />
            )}
            <span className="hidden sm:inline">
              {walletConfig.isConnected && walletConfig.address
                ? `${walletConfig.address.substring(0, 4)}...${walletConfig.address.substring(walletConfig.address.length - 4)}`
                : t("walletConfig")}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                walletConfig.isConnected
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {walletConfig.mode === "REAL" ? t("real") : t("demo")}
            </span>
          </button>

          {/* Descargar para Android Trigger */}
          <button
            id="open-android-apk-button"
            onClick={onOpenAndroidModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-colors shadow-sm"
            title={t("downloadAndroid")}
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">{t("downloadAndroid")}</span>
          </button>
        </div>
      </div>

      {apiError && (
        <div className="max-w-7xl mx-auto mt-2 text-xs bg-amber-950/40 border border-amber-800/40 text-amber-300 px-3 py-1.5 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
            <span>{apiError}</span>
          </div>
          <button
            onClick={onManualRefresh}
            className="underline hover:text-amber-200 text-[11px] font-semibold ml-2"
          >
            {t("retry")}
          </button>
        </div>
      )}
    </header>
  );
};

