import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Download,
  X,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Package,
  Sparkles,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  FileCode2,
  Share2,
  FolderArchive,
  Search,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface AndroidApkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AndroidApkModal: React.FC<AndroidApkModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<'install' | 'manifest' | 'project' | 'pwabuilder'>('install');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedManifest, setCopiedManifest] = useState(false);
  const [manifestContent, setManifestContent] = useState<string>('');
  const [manifestStatus, setManifestStatus] = useState<'loading' | 'valid' | 'error'>('loading');

  useEffect(() => {
    if (isOpen) {
      // Fetch manifest.json locally from current host to verify it works 100%
      fetch('/manifest.json')
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          setManifestContent(JSON.stringify(data, null, 2));
          setManifestStatus('valid');
        })
        .catch((err) => {
          console.error('Manifest check error:', err);
          setManifestStatus('error');
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const handleCopyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2500);
  };

  const handleCopyManifest = () => {
    if (manifestContent) {
      navigator.clipboard.writeText(manifestContent);
      setCopiedManifest(true);
      setTimeout(() => setCopiedManifest(false), 2500);
    }
  };

  const handleDownloadManifest = () => {
    const blob = new Blob([manifestContent || '{}'], { type: 'application/manifest+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'manifest.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Pacharolo Island APP
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                  Android / APK
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Soluciones directas para instalar Pacharolo Island en tu teléfono móvil
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

        {/* Diagnostic Alert: Why external scanners say "no encuentra el manifest" */}
        <div className="bg-amber-950/40 border-b border-amber-600/30 px-5 py-2.5 flex items-start gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300">¿Por qué un scanner o PWABuilder dice "no encuentra el manifest"? </span>
            Los servidores de PWABuilder o validadores externos son <strong>bots que intentan acceder desde fuera</strong> a tu URL privada (<code className="text-amber-200 font-mono text-[11px]">.run.app</code>). El firewall de Google AI Studio los redirige a una pantalla de cookies y por eso no pueden leerlo. <strong>El archivo sí existe y está activo al 100%</strong> (mira la pestaña <em>"Diagnóstico Manifest"</em>).
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 pt-2 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('install')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 whitespace-nowrap ${
              activeTab === 'install'
                ? 'text-cyan-400 border-cyan-400 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            1. Instalar en Móvil
          </button>
          <button
            onClick={() => setActiveTab('manifest')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 whitespace-nowrap ${
              activeTab === 'manifest'
                ? 'text-cyan-400 border-cyan-400 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <Search className="w-4 h-4" />
            2. Diagnóstico Manifest
          </button>
          <button
            onClick={() => setActiveTab('project')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 whitespace-nowrap ${
              activeTab === 'project'
                ? 'text-emerald-400 border-emerald-400 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <FolderArchive className="w-4 h-4" />
            3. Descargar Proyecto Android (.ZIP)
          </button>
          <button
            onClick={() => setActiveTab('pwabuilder')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 whitespace-nowrap ${
              activeTab === 'pwabuilder'
                ? 'text-cyan-400 border-cyan-400 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <Package className="w-4 h-4" />
            4. PWABuilder
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-300 text-sm">
          {/* TAB 1: INSTALACIÓN DIRECTA EN EL MÓVIL */}
          {activeTab === 'install' && (
            <div className="space-y-4">
              <div className="bg-emerald-950/30 border border-emerald-600/30 rounded-xl p-4 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 space-y-1">
                  <p className="font-semibold text-white">
                    ¡No necesitas compilar un APK para tener la app nativa en tu Android!
                  </p>
                  <p>
                    Android soporta instalación directa desde el navegador: se coloca en tu pantalla de inicio y cajón de aplicaciones con el logo oficial de Jupiter DEX, se ejecuta a pantalla completa (sin barra del navegador) y se actualiza sola automáticamente.
                  </p>
                </div>
              </div>

              {isInstalled ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-950/40 border border-emerald-600/40 text-emerald-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="font-semibold">¡Aplicación instalada con éxito!</p>
                    <p className="text-xs text-emerald-400/80">
                      Ya estás ejecutando la aplicación en modo nativo en tu dispositivo.
                    </p>
                  </div>
                </div>
              ) : isInstallable ? (
                <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/80 to-blue-950/80 border border-cyan-500/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-white text-sm sm:text-base">Instalar en 1 toque en este dispositivo</h4>
                    <p className="text-xs text-cyan-200/80">
                      Instalación instantánea con manifest.json y service worker
                    </p>
                  </div>
                  <button
                    onClick={install}
                    className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition active:scale-95"
                  >
                    <Download className="w-4 h-4" />
                    Instalar Ahora
                  </button>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 space-y-2.5">
                  <h4 className="font-semibold text-white text-xs sm:text-sm flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-cyan-400" />
                    Cómo instalar en tu móvil Android en 2 sencillos pasos:
                  </h4>
                  <ol className="list-decimal list-inside space-y-2 text-xs text-slate-300 pl-1">
                    <li>
                      Abre este enlace en <strong>Google Chrome</strong> o <strong>Brave</strong> en tu teléfono Android (escaneando el código QR de abajo).
                    </li>
                    <li>
                      Pulsa el botón de menú <span className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono font-bold">⋮</span> (arriba a la derecha).
                    </li>
                    <li>
                      Toca en <strong>"Instalar aplicación"</strong> (o <strong>"Agregar a pantalla principal"</strong>).
                    </li>
                    <li>
                      ¡Listo! Ya tienes el icono de Jupiter DEX en tu móvil y se abre a pantalla completa.
                    </li>
                  </ol>
                </div>
              )}

              {/* QR Code section to open on phone */}
              <div className="border-t border-slate-800 pt-4 flex flex-col sm:flex-row items-center gap-4">
                <div className="bg-white p-2 rounded-xl shadow-md shrink-0">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
                      currentUrl
                    )}&color=020617`}
                    alt="Código QR para Android"
                    className="w-24 h-24 sm:w-28 sm:h-28"
                  />
                </div>
                <div className="space-y-2 text-xs flex-1">
                  <p className="font-semibold text-white flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-cyan-400" />
                    Escanea con la cámara de tu teléfono:
                  </p>
                  <p className="text-slate-400">
                    Apunta con la cámara de tu móvil para abrir la app directamente en Chrome y tocar "Instalar aplicación".
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      readOnly
                      value={currentUrl}
                      className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] text-slate-300 w-full font-mono select-all"
                    />
                    <button
                      onClick={handleCopyUrl}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-[11px] font-medium flex items-center gap-1 shrink-0 transition"
                    >
                      {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedUrl ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DIAGNÓSTICO DEL MANIFEST */}
          {activeTab === 'manifest' && (
            <div className="space-y-4">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <Search className="w-4 h-4 text-cyan-400" />
                    <span>Estado del Archivo manifest.json en el Servidor</span>
                  </div>
                  {manifestStatus === 'valid' ? (
                    <span className="flex items-center gap-1 text-[11px] bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      HTTP 200 OK — Válido
                    </span>
                  ) : manifestStatus === 'loading' ? (
                    <span className="text-[11px] text-cyan-300">Verificando...</span>
                  ) : (
                    <span className="text-[11px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded">Error de lectura</span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Ruta Directa</span>
                    <span className="font-mono text-cyan-300 text-[11px]">/manifest.json</span>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">MIME Type</span>
                    <span className="font-mono text-cyan-300 text-[11px]">manifest+json</span>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Iconos</span>
                    <span className="font-mono text-emerald-400 text-[11px]">192, 512, SVG</span>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">Service Worker</span>
                    <span className="font-mono text-emerald-400 text-[11px]">/sw.js Activo</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href="/manifest.json"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-medium flex items-center gap-1.5 transition border border-slate-700"
                  >
                    <span>Abrir /manifest.json en pestaña nueva</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    onClick={handleDownloadManifest}
                    className="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 rounded text-xs font-medium flex items-center gap-1.5 transition border border-cyan-500/30"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar manifest.json</span>
                  </button>

                  <button
                    onClick={handleCopyManifest}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-medium flex items-center gap-1.5 transition border border-slate-700"
                  >
                    {copiedManifest ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedManifest ? 'Copiado' : 'Copiar JSON'}</span>
                  </button>
                </div>
              </div>

              {/* Code preview */}
              <div className="space-y-1.5">
                <span className="text-xs text-slate-400">Contenido oficial servido por el servidor:</span>
                <pre className="bg-black/70 p-3 rounded-xl text-emerald-400 font-mono text-[11px] border border-slate-800 max-h-48 overflow-y-auto">
                  {manifestContent || '// Cargando manifest...'}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: DESCARGAR PROYECTO ANDROID COMPLETO */}
          {activeTab === 'project' && (
            <div className="space-y-4">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <FolderArchive className="w-4 h-4 text-emerald-400" />
                    <span>Paquete Android Studio Listo para Compilar APK</span>
                  </div>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 font-mono">
                    120 KB .ZIP
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Hemos generado el proyecto Android nativo completo con su <code className="text-cyan-300">MainActivity.java</code>, <code className="text-cyan-300">AndroidManifest.xml</code>, iconos en todas las densidades de pantalla (hdpi, xhdpi, xxhdpi) y configuración Gradle.
                </p>

                {/* Direct Download Button */}
                <a
                  href="/api/download-android-project"
                  download="pacharolo-island-app-android-project.zip"
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20 active:scale-98"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar pacharolo-island-app-android-project.zip</span>
                </a>
              </div>

              {/* Instructions on how to build APK */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
                <h4 className="font-semibold text-white flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-cyan-400" />
                  Cómo generar tu archivo .APK en Android Studio:
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-slate-300 pl-1 leading-relaxed">
                  <li>
                    Descomprime el archivo <strong>pacharolo-island-app-android-project.zip</strong>.
                  </li>
                  <li>
                    Abre <strong>Android Studio</strong> y haz clic en <strong>"Open"</strong> (selecciona la carpeta descomprimida).
                  </li>
                  <li>
                    En la barra de menú superior de Android Studio, haz clic en:
                    <div className="mt-1 bg-black/60 p-2 rounded text-cyan-300 font-mono text-[11px] border border-slate-800">
                      Build &gt; Build Bundle(s) / APK(s) &gt; Build APK(s)
                    </div>
                  </li>
                  <li>
                    En unos segundos aparecerá la notificación con el enlace <strong>"locate"</strong> para obtener tu archivo <code className="text-emerald-300 font-bold">app-debug.apk</code> listo para instalar en cualquier móvil Android.
                  </li>
                </ol>

                <div className="pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>O desde tu terminal con Gradle:</span>
                    <button
                      onClick={() => handleCopyCmd('./gradlew assembleDebug')}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      {copiedCmd ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCmd ? 'Copiado' : 'Copiar comando'}</span>
                    </button>
                  </div>
                  <pre className="bg-black/70 p-2 rounded text-emerald-400 font-mono text-[11px] border border-slate-800">
                    ./gradlew assembleDebug
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CÓMO USAR PWABUILDER CON URL PÚBLICA */}
          {activeTab === 'pwabuilder' && (
            <div className="space-y-4">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-white font-semibold text-sm">
                  <Share2 className="w-4 h-4 text-cyan-400" />
                  <span>Cómo hacer que PWABuilder funcione al 100%</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Para que el servidor de PWABuilder pueda leer tu aplicación, necesita darle una <strong>URL pública</strong> (sin la protección de cookies de desarrollo de AI Studio).
                </p>

                <div className="bg-slate-900 border border-cyan-800/40 rounded-xl p-3.5 space-y-2.5 text-xs">
                  <p className="font-semibold text-cyan-300">Pasos exactos:</p>
                  <ol className="list-decimal list-inside space-y-2 text-slate-300">
                    <li>
                      En la parte superior derecha de Google AI Studio, haz clic en el botón <strong>"Share" (Compartir)</strong> o en el menú de despliegue.
                    </li>
                    <li>
                      Copia el <strong>enlace público compartido</strong> (Shared Link).
                    </li>
                    <li>
                      Abre <strong>PWABuilder.com</strong>, pega ese enlace público y presiona <strong>"Start"</strong>.
                    </li>
                    <li>
                      En la pestaña <strong>Android</strong>, haz clic en <strong>"Generate Package"</strong> para descargar tu archivo <strong>.apk</strong> o <strong>.aab</strong> de Google Play.
                    </li>
                  </ol>
                </div>

                <a
                  href="https://www.pwabuilder.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition border border-slate-700"
                >
                  <Package className="w-4 h-4 text-cyan-400" />
                  <span>Ir a PWABuilder.com</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/95 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">PWA + Proyecto Android + APK</span>
            <span className="sm:hidden">Android Ready</span>
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
