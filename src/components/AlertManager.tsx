import React, { useState } from "react";
import {
  X,
  Bell,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Volume2,
  CheckCircle,
  Clock,
  Zap,
} from "lucide-react";
import { AlertRule, CryptoSymbol, TokenPriceData, TriggeredAlertNotification } from "../types";

interface AlertManagerProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: AlertRule[];
  tokens: Record<CryptoSymbol, TokenPriceData>;
  onAddAlert: (alert: Omit<AlertRule, "id" | "createdAt" | "triggeredCount">) => void;
  onToggleAlert: (id: string) => void;
  onDeleteAlert: (id: string) => void;
  notifications: TriggeredAlertNotification[];
  onClearNotifications: () => void;
  onTestSound: () => void;
  initialSymbol?: CryptoSymbol;
}

export const AlertManager: React.FC<AlertManagerProps> = ({
  isOpen,
  onClose,
  alerts,
  tokens,
  onAddAlert,
  onToggleAlert,
  onDeleteAlert,
  notifications,
  onClearNotifications,
  onTestSound,
  initialSymbol = "SOL",
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<CryptoSymbol>(initialSymbol);
  const [condition, setCondition] = useState<"ABOVE" | "BELOW">("ABOVE");
  const [targetPrice, setTargetPrice] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [activeTab, setActiveTab] = useState<"rules" | "history">("rules");

  // Keep targetPrice synchronized if empty or symbol changes
  React.useEffect(() => {
    if (tokens[selectedSymbol]) {
      const cur = tokens[selectedSymbol].usdPrice;
      const suggested = condition === "ABOVE" ? cur * 1.03 : cur * 0.97;
      setTargetPrice(suggested.toFixed(cur > 100 ? 2 : 4));
    }
  }, [selectedSymbol, condition, tokens]);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(targetPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert("Por favor introduce un precio objetivo válido.");
      return;
    }

    onAddAlert({
      symbol: selectedSymbol,
      condition,
      targetPrice: priceNum,
      isActive: true,
      notes: notes.trim() || undefined,
    });

    setNotes("");
  };

  const setPreset = (percentageDelta: number) => {
    const cur = tokens[selectedSymbol]?.usdPrice || 100;
    const newTarget = cur * (1 + percentageDelta / 100);
    setTargetPrice(newTarget.toFixed(cur > 100 ? 2 : 4));
    if (percentageDelta > 0) {
      setCondition("ABOVE");
    } else {
      setCondition("BELOW");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Bell className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Alertas de Umbrales de Precio
              </h2>
              <p className="text-xs text-slate-400">
                Notificaciones automáticas en tiempo real cuando el precio cruce tus metas
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

        {/* Modal Navigation Tabs */}
        <div className="flex items-center border-b border-slate-800 px-6 bg-slate-950/30 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("rules")}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "rules"
                ? "border-cyan-500 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>Configurar Alertas</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
              {alerts.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "history"
                ? "border-cyan-500 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>Historial de Disparos</span>
            {notifications.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px]">
                {notifications.length}
              </span>
            )}
          </button>
          <div className="ml-auto flex items-center">
            <button
              onClick={onTestSound}
              className="text-[11px] text-slate-400 hover:text-cyan-400 flex items-center gap-1.5 py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
              title="Probar sonido sintetizado de alerta"
            >
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Probar Sonido</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === "rules" ? (
            <>
              {/* Form to Add New Alert */}
              <form
                onSubmit={handleCreate}
                className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-4"
              >
                <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Nueva Regla de Umbral</span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Precio actual {selectedSymbol}: $
                    {tokens[selectedSymbol]?.usdPrice.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Select Token */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Criptomoneda</label>
                    <div className="grid grid-cols-5 gap-1">
                      {(["BTC", "ETH", "SOL", "ZEC", "HYPE"] as CryptoSymbol[]).map((sym) => (
                        <button
                          type="button"
                          key={sym}
                          onClick={() => setSelectedSymbol(sym)}
                          className={`py-1.5 rounded text-xs font-bold transition-all ${
                            selectedSymbol === sym
                              ? "bg-cyan-500 text-slate-950 font-bold shadow-sm"
                              : "bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
                          }`}
                        >
                          {sym}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Select Condition */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Condición</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCondition("ABOVE")}
                        className={`flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium border transition-colors ${
                          condition === "ABOVE"
                            ? "bg-emerald-950/50 border-emerald-500 text-emerald-400 font-semibold"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>Mayor que (≥)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCondition("BELOW")}
                        className={`flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium border transition-colors ${
                          condition === "BELOW"
                            ? "bg-rose-950/50 border-rose-500 text-rose-400 font-semibold"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <TrendingDown className="w-3.5 h-3.5" />
                        <span>Menor que (≤)</span>
                      </button>
                    </div>
                  </div>

                  {/* Target Price */}
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Precio Umbral ($ USD)</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={targetPrice}
                      onChange={(e) => setTargetPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] text-slate-500">Ajuste rápido:</span>
                  {[
                    { label: "+1%", val: 1 },
                    { label: "+3%", val: 3 },
                    { label: "+5%", val: 5 },
                    { label: "-1%", val: -1 },
                    { label: "-3%", val: -3 },
                    { label: "-5%", val: -5 },
                  ].map((p) => (
                    <button
                      type="button"
                      key={p.label}
                      onClick={() => setPreset(p.val)}
                      className={`text-[11px] px-2 py-0.5 rounded font-mono border transition-colors ${
                        p.val > 0
                          ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-400 hover:bg-emerald-900/40"
                          : "bg-rose-950/30 border-rose-800/40 text-rose-400 hover:bg-rose-900/40"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Optional Note & Submit Button */}
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Nota opcional (ej: Tomar ganancias / Stop loss)"
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-slate-700"
                  />
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Guardar Alerta</span>
                  </button>
                </div>
              </form>

              {/* Configured Alerts List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">Alertas Configuradas ({alerts.length})</span>
                </div>

                {alerts.length === 0 ? (
                  <div className="text-center py-8 bg-slate-950/30 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                    No tienes alertas configuradas. Agrega una arriba para ser notificado automáticamente.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alerts.map((al) => {
                      const curToken = tokens[al.symbol];
                      const curPrice = curToken?.usdPrice || 0;
                      const diffPct = ((al.targetPrice - curPrice) / curPrice) * 100;

                      return (
                        <div
                          key={al.id}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                            al.isActive
                              ? "bg-slate-950/60 border-slate-800 text-slate-200"
                              : "bg-slate-950/20 border-slate-900 text-slate-500 opacity-60"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => onToggleAlert(al.id)}
                              className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${
                                al.isActive
                                  ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                                  : "bg-slate-800 border-slate-700 text-slate-500"
                              }`}
                              title={al.isActive ? "Desactivar" : "Activar"}
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-sm">{al.symbol}</span>
                                <span
                                  className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                    al.condition === "ABOVE"
                                      ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                                      : "bg-rose-950/60 text-rose-400 border border-rose-800/40"
                                  }`}
                                >
                                  {al.condition === "ABOVE" ? "≥ Mayor que" : "≤ Menor que"}
                                </span>
                                <span className="font-mono font-bold text-white text-sm">
                                  ${al.targetPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                                <span>Distancia: {diffPct > 0 ? `+${diffPct.toFixed(2)}%` : `${diffPct.toFixed(2)}%`}</span>
                                {al.notes && <span>• {al.notes}</span>}
                                {al.triggeredCount > 0 && (
                                  <span className="text-amber-400">• Disparada {al.triggeredCount}x</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onDeleteAlert(al.id)}
                              className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                              title="Eliminar alerta"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* History Tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">
                  Registro de Alertas Disparadas ({notifications.length})
                </span>
                {notifications.length > 0 && (
                  <button
                    onClick={onClearNotifications}
                    className="text-rose-400 hover:text-rose-300 text-[11px]"
                  >
                    Borrar historial
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  Aún no se han disparado alertas. Cuando el precio alcance tu umbral configurado, se guardará aquí el registro.
                </div>
              ) : (
                <div className="space-y-2">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
                          <Bell className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white">{notif.symbol}</span>
                            <span className="text-slate-400">cruzó el umbral de</span>
                            <span className="font-mono text-amber-300 font-semibold">
                              ${notif.targetPrice.toLocaleString("en-US")}
                            </span>
                            <span className="text-slate-500 font-mono">
                              (Cotizó a ${notif.actualPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })})
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {new Date(notif.timestamp).toLocaleString("es-ES")}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
