'use client';

import { useState, useEffect, useCallback } from 'react';
import { Smartphone, Wifi, WifiOff, RefreshCw, LogOut, Shield, MessageCircle } from 'lucide-react';
import Image from 'next/image';

type ConnectionState = 'open' | 'close' | 'connecting' | 'unknown';

interface Status {
  state: ConnectionState;
  instanceName: string;
  profileName?: string | null;
  profilePictureUrl?: string | null;
}

export default function WhatsAppPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [pollingId, setPollingId] = useState<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data: Status = await res.json();
        setStatus(data);
        if (data.state === 'open') {
          setQrCode(null);
          if (pollingId) {
            clearInterval(pollingId);
            setPollingId(null);
          }
        }
      }
    } catch (e) {
      console.error('Status fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [pollingId]);

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setQrCode(null);
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' });
      const data = await res.json();
      if (data.qrcode) {
        setQrCode(data.qrcode);
        // Poll status every 5s while QR is displayed
        const id = setInterval(fetchStatus, 5000);
        setPollingId(id);
      }
    } catch (e) {
      console.error('Connect error', e);
    } finally {
      setConnecting(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/whatsapp/logout', { method: 'POST' });
      setStatus(prev => prev ? { ...prev, state: 'close' } : null);
      setQrCode(null);
    } finally {
      setLoggingOut(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollingId) clearInterval(pollingId);
    };
  }, [pollingId]);

  const isConnected = status?.state === 'open';
  const isConnecting = status?.state === 'connecting';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <MessageCircle className="text-green-500" size={28} />
          WhatsApp
        </h1>
        <p className="text-gray-500 mt-1">
          Connectez un numéro WhatsApp pour publier des articles via des commandes chat.
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Status Banner */}
        <div className={`px-6 py-4 flex items-center gap-3 ${
          isConnected
            ? 'bg-green-50 border-b border-green-100'
            : isConnecting
            ? 'bg-yellow-50 border-b border-yellow-100'
            : 'bg-gray-50 border-b border-gray-100'
        }`}>
          {isConnected ? (
            <Wifi size={20} className="text-green-600" />
          ) : (
            <WifiOff size={20} className="text-gray-400" />
          )}
          <div>
            <p className={`font-semibold text-sm ${isConnected ? 'text-green-700' : 'text-gray-600'}`}>
              {loading
                ? 'Chargement...'
                : isConnected
                ? `✅ Connecté${status?.profileName ? ` — ${status.profileName}` : ''}`
                : isConnecting
                ? '🔄 Connexion en cours...'
                : '⚫ Déconnecté'}
            </p>
            <p className="text-xs text-gray-400">
              Instance : <code className="bg-gray-100 px-1 rounded">{status?.instanceName ?? 'WPAutoPublish'}</code>
            </p>
          </div>
          {isConnected && status?.profilePictureUrl && (
            <Image
              src={status.profilePictureUrl}
              alt="Profile"
              width={36}
              height={36}
              className="rounded-full ml-auto border-2 border-green-200"
            />
          )}
        </div>

        <div className="p-6 space-y-6">
          {/* QR Code Display */}
          {qrCode && !isConnected && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="bg-white p-4 rounded-2xl shadow-md border border-gray-200 inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                  alt="QR Code WhatsApp"
                  className="w-56 h-56"
                />
              </div>
              <div className="text-center space-y-1">
                <p className="font-medium text-gray-700">Scannez avec votre téléphone</p>
                <p className="text-sm text-gray-500">
                  Ouvrez WhatsApp → ⋮ → Appareils connectés → Associer un appareil
                </p>
                <p className="text-xs text-gray-400 flex items-center justify-center gap-1 mt-2">
                  <RefreshCw size={12} className="animate-spin" />
                  Vérification automatique toutes les 5 secondes...
                </p>
              </div>
            </div>
          )}

          {/* Connected State Info */}
          {isConnected && !qrCode && (
            <div className="bg-green-50 rounded-xl p-4 text-sm text-green-800 space-y-2">
              <p className="font-semibold">✅ WhatsApp est opérationnel !</p>
              <p>Vous pouvez maintenant envoyer des commandes depuis votre numéro :</p>
              <ul className="list-disc list-inside space-y-1 pl-2 text-green-700">
                <li><code className="bg-green-100 px-1 rounded">/post 5 [site]</code> — Publie 5 articles</li>
                <li><code className="bg-green-100 px-1 rounded">/sites</code> — Liste vos sites</li>
                <li><code className="bg-green-100 px-1 rounded">/status</code> — Rapport d&apos;activité</li>
                <li><code className="bg-green-100 px-1 rounded">/help</code> — Aide complète</li>
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
            {!isConnected && (
              <button
                id="whatsapp-connect-btn"
                onClick={handleConnect}
                disabled={connecting || loading}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium px-5 py-2.5 rounded-xl transition-all shadow-sm"
              >
                <Smartphone size={16} />
                {connecting ? 'Génération...' : qrCode ? 'Rafraîchir le QR' : 'Connecter un numéro'}
              </button>
            )}

            {isConnected && (
              <button
                id="whatsapp-logout-btn"
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex items-center gap-2 bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-600 font-medium px-5 py-2.5 rounded-xl transition-all border border-red-200"
              >
                <LogOut size={16} />
                {loggingOut ? 'Déconnexion...' : 'Déconnecter'}
              </button>
            )}

            <button
              id="whatsapp-refresh-btn"
              onClick={fetchStatus}
              disabled={loading}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Rafraîchir
            </button>
          </div>
        </div>
      </div>

      {/* Security Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
          <Shield size={18} className="text-blue-500" />
          Sécurité — Numéros autorisés
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Seuls les numéros listés dans la variable <code className="bg-gray-100 px-1 rounded text-xs">ALLOWED_WHATSAPP_NUMBERS</code> peuvent envoyer des commandes. Si la variable est vide, tous les numéros sont acceptés.
        </p>
        {process.env.NEXT_PUBLIC_ALLOWED_NUMBERS_CONFIGURED === 'true' ? (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg text-sm">
            <Shield size={14} /> Allowlist active
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg text-sm">
            ⚠️ Aucun numéro autorisé configuré — tous les messages sont acceptés.
            Ajoutez <code>ALLOWED_WHATSAPP_NUMBERS</code> dans vos variables Railway.
          </div>
        )}
      </div>
    </div>
  );
}
