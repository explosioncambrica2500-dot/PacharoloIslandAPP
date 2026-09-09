import React, { useState } from 'react';
import {
  Smartphone,
  Download,
  X,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  QrCode,
  Sparkles,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface AndroidApkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AndroidApkModal: React.FC<AndroidApkModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-emerald-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Descargar para Android
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                  Android
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Pacharolo Island APP en tu teléfono móvil
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-300 text-sm">
          {/* Direct Install trigger if supported by browser */}
          {isInstalled ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-950/40 border border-emerald-600/40 text-emerald-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-semibold text-white">¡Aplicación ya instalada!</p>
                <p className="text-xs text-emerald-400/80">
                  Pacharolo Island APP está funcionando en modo nativo en este dispositivo.
                </p>
              </div>
            </div>
          ) : isInstallable ? (
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/80 to-cyan-950/80 border border-emerald-500/40 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-white text-sm sm:text-base flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  Instalar en 1 toque en este dispositivo
                </h4>
                <p className="text-xs text-emerald-200/80">
                  Agrega el icono oficial a tu pantalla de inicio
                </p>
              </div>
              <button
                onClick={install}
                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-slate-950 font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition active:scale-95"
              >
                <Download className="w-4 h-4" />
                Instalar Ahora
              </button>
            </div>
          ) : null}

          {/* Enlace para Android */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-white text-xs sm:text-sm flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                Enlace para descargar / abrir en Android
              </h4>
            </div>
            <p className="text-xs text-slate-400">
              Abre o comparte este enlace en tu teléfono móvil Android:
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={currentUrl}
                className="bg-slate-900 border border-slate-700/70 rounded-lg px-3 py-2 text-xs text-emerald-300 w-full font-mono select-all focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleCopyUrl}
                className="px-3.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 transition"
              >
                {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedUrl ? 'Copiado' : 'Copiar enlace'}</span>
              </button>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 flex flex-col sm:flex-row items-center gap-4">
            <div className="bg-white p-2 rounded-xl shadow-md shrink-0">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(
                  currentUrl
                )}&color=020617`}
                alt="Código QR para Android"
                className="w-28 h-28"
              />
            </div>
            <div className="space-y-2 text-xs flex-1 text-center sm:text-left">
              <p className="font-semibold text-white flex items-center justify-center sm:justify-start gap-1.5">
                <QrCode className="w-4 h-4 text-emerald-400" />
                Escanea con la cámara de tu Android
              </p>
              <p className="text-slate-400 leading-relaxed">
                Apunta con la cámara de tu móvil para abrir la aplicación directamente en Chrome o Brave sin tener que escribir la dirección.
              </p>
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium pt-1"
              >
                <span>Abrir enlace directamente</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* 3 Simple Steps */}
          <div className="rounded-xl bg-slate-950/50 border border-slate-800/80 p-4 space-y-2.5 text-xs">
            <h4 className="font-semibold text-white text-xs sm:text-sm">
              Pasos para instalar en Android:
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-slate-300 pl-1 leading-relaxed">
              <li>
                Abre el enlace en <strong>Google Chrome</strong> o <strong>Brave</strong> en tu teléfono.
              </li>
              <li>
                Toca el botón de opciones del navegador <span className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono font-bold">⋮</span> (arriba a la derecha).
              </li>
              <li>
                Selecciona <strong>"Instalar aplicación"</strong> (o <strong>"Agregar a la pantalla principal"</strong>).
              </li>
              <li>
                ¡Listo! Se agregará el icono de <strong>Pacharolo Island APP</strong> en tu pantalla de inicio y se abrirá a pantalla completa.
              </li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/95 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Pacharolo Island APP para Android</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
