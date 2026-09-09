import React, { useState } from "react";
import { X, Copy, Check, Download, Terminal, Play, CheckCircle2, AlertTriangle } from "lucide-react";
import { PYTHON_SCRIPT_CODE } from "../data/pythonScriptCode";

interface PythonScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PythonScriptModal: React.FC<PythonScriptModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(PYTHON_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    // Direct in-memory Blob download ensuring 100% pure Python without network HTML interception
    const blob = new Blob([PYTHON_SCRIPT_CODE], { type: "text/x-python;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "jupiter_dex_monitor.py";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-yellow-500 to-blue-500 p-0.5 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Terminal className="w-5 h-5 text-yellow-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Script Python: Monitor Jupiter DEX
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.2 rounded bg-yellow-950/60 text-yellow-400 border border-yellow-800/40">
                  jupiter_dex_monitor.py
                </span>
              </div>
              <p className="text-xs text-slate-400">
                100% Python estándar (sin requerir pip install requests). Conexión en tiempo real a Jupiter DEX.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? "Copiado" : "Copiar Código"}</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-xs font-bold text-slate-950 shadow-md transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Descargar .py</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Instructions Banner */}
        <div className="px-6 py-2.5 bg-slate-950/40 border-b border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2 text-slate-300">
          <div className="flex items-center gap-2">
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ejecución en consola:</span>
            <code className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-cyan-300 font-mono text-[11px]">
              python3 jupiter_dex_monitor.py
            </code>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>• [B] Compra inicial (Mayor %)</span>
            <span>• [S] Swap rotativo (Menor caída ➔ Mayor caída)</span>
            <span>• [T] Bot Auto</span>
            <span>• [E] Exportar CSV</span>
          </div>
        </div>

        {/* Code View Area */}
        <div className="p-4 overflow-y-auto flex-1 bg-slate-950 font-mono text-xs text-slate-300 space-y-3">
          <div className="bg-cyan-950/40 border border-cyan-800/40 rounded-lg p-2.5 text-[11px] text-cyan-200 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Descarga directa corregida:</strong> El botón <em>"Descargar .py"</em> ahora genera el archivo directamente en memoria sin pasar por el servidor web (evitando que el navegador guarde la página HTML). También puedes pulsar <em>"Copiar Código"</em> y pegarlo en tu archivo.
            </span>
          </div>

          <pre className="whitespace-pre overflow-x-auto leading-relaxed selection:bg-cyan-900 selection:text-white">
            {PYTHON_SCRIPT_CODE}
          </pre>
        </div>
      </div>
    </div>
  );
};
