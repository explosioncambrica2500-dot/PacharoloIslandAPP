import React from "react";
import { Bell, X, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { TriggeredAlertNotification } from "../types";

interface NotificationToastProps {
  notifications: TriggeredAlertNotification[];
  onDismiss: (id: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notifications,
  onDismiss,
}) => {
  const activeToasts = notifications.slice(0, 3); // show maximum 3 simultaneous toasts

  if (activeToasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {activeToasts.map((n) => {
        const isAbove = n.condition === "ABOVE";
        return (
          <div
            key={n.id}
            className="pointer-events-auto bg-slate-900/95 border border-amber-500/50 shadow-2xl rounded-xl p-3.5 flex items-start justify-between gap-3 backdrop-blur-md animate-in slide-in-from-bottom-5 duration-300 ring-1 ring-amber-500/20"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0 mt-0.5">
                <Bell className="w-4 h-4 animate-bounce" />
              </div>
              <div className="text-xs">
                <div className="flex items-center gap-1.5 font-bold text-white">
                  <span>Alerta de Precio Activada</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-semibold flex items-center ${
                      isAbove
                        ? "bg-emerald-950 text-emerald-400"
                        : "bg-rose-950 text-rose-400"
                    }`}
                  >
                    {isAbove ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {n.symbol}
                  </span>
                </div>
                <p className="text-slate-300 mt-1">
                  {n.symbol} cotiza a{" "}
                  <strong className="text-white font-mono">
                    ${n.actualPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </strong>
                  , cruzando tu umbral de{" "}
                  <span className="text-amber-300 font-mono">
                    ${n.targetPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </p>
                <span className="text-[10px] text-slate-500 block mt-1">
                  {new Date(n.timestamp).toLocaleTimeString("es-ES")}
                </span>
              </div>
            </div>
            <button
              onClick={() => onDismiss(n.id)}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
