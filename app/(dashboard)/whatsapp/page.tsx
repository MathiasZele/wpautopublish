'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Smartphone, Wifi, WifiOff, RefreshCw, LogOut,
  Shield, MessageCircle, Plus, Trash2, UserCheck
} from 'lucide-react';
import Image from 'next/image';

type ConnectionState = 'open' | 'close' | 'connecting' | 'unknown';

interface InstanceStatus {
  state: ConnectionState;
  instanceName: string;
  profileName?: string | null;
  profilePictureUrl?: string | null;
}

interface AllowedNumber {
  id: string;
  phoneNumber: string;
  label: string | null;
  createdAt: string;
}

export default function WhatsAppPage() {
  // Connection state
  const [status, setStatus] = useState<InstanceStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [pollingId, setPollingId] = useState<ReturnType<typeof setInterval> | null>(null);

  // Allowlist state
  const [allowedNumbers, setAllowedNumbers] = useState<AllowedNumber[]>([]);
  const [newPhone, setNewPhone] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data: InstanceStatus = await res.json();
        setStatus(data);
        if (data.state === 'open') {
          setQrCode(null);
          if (pollingId) { clearInterval(pollingId); setPollingId(null); }
        }
      }
    } catch (e) {
      console.error('Status fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [pollingId]);

  const fetchAllowedNumbers = useCallback(async () => {
    const res = await fetch('/api/whatsapp/allowed-numbers');
    if (res.ok) setAllowedNumbers(await res.json());
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchAllowedNumbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { if (pollingId) clearInterval(pollingId); }, [pollingId]);

  const handleConnect = async () => {
    setConnecting(true); setQrCode(null);
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' });
      const data = await res.json();
      if (data.qrcode) {
        setQrCode(data.qrcode);
        const id = setInterval(fetchStatus, 5000);
        setPollingId(id);
      }
    } finally { setConnecting(false); }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/whatsapp/logout', { method: 'POST' });
      setStatus(prev => prev ? { ...prev, state: 'close' } : null);
      setQrCode(null);
    } finally { setLoggingOut(false); }
  };

  const handleAddNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (!newPhone.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch('/api/whatsapp/allowed-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: newPhone.trim(), label: newLabel.trim() || undefined }),
      });
      if (res.ok) {
        setNewPhone(''); setNewLabel('');
        fetchAllowedNumbers();
      } else {
        const data = await res.json();
        setAddError(data.error || 'Erreur lors de l\'ajout.');
      }
    } finally { setAddLoading(false); }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/whatsapp/allowed-numbers/${id}`, { method: 'DELETE' });
      setAllowedNumbers(prev => prev.filter(n => n.id !== id));
    } finally { setDeletingId(null); }
  };

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
          Connectez un numéro et gérez les accès pour publier via WhatsApp.
        </p>
      </div>

      {/* Connection Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className={`px-6 py-4 flex items-center gap-3 ${
          isConnected ? 'bg-green-50 border-b border-green-100'
          : isConnecting ? 'bg-yellow-50 border-b border-yellow-100'
          : 'bg-gray-50 border-b border-gray-100'
        }`}>
          {isConnected ? <Wifi size={20} className="text-green-600" /> : <WifiOff size={20} className="text-gray-400" />}
          <div>
            <p className={`font-semibold text-sm ${isConnected ? 'text-green-700' : 'text-gray-600'}`}>
              {loading ? 'Chargement...'
                : isConnected ? `✅ Connecté${status?.profileName ? ` — ${status.profileName}` : ''}`
                : isConnecting ? '🔄 Connexion en cours...'
                : '⚫ Déconnecté'}
            </p>
            <p className="text-xs text-gray-400">
              Instance : <code className="bg-gray-100 px-1 rounded">{status?.instanceName ?? 'WPAutoPublish'}</code>
            </p>
          </div>
          {isConnected && status?.profilePictureUrl && (
            <Image src={status.profilePictureUrl} alt="Profile" width={36} height={36}
              className="rounded-full ml-auto border-2 border-green-200" />
          )}
        </div>

        <div className="p-6 space-y-5">
          {qrCode && !isConnected && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="bg-white p-4 rounded-2xl shadow-md border border-gray-200 inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                  alt="QR Code WhatsApp" className="w-56 h-56"
                />
              </div>
              <div className="text-center space-y-1">
                <p className="font-medium text-gray-700">Scannez avec votre téléphone</p>
                <p className="text-sm text-gray-500">WhatsApp → ⋮ → Appareils connectés → Associer un appareil</p>
                <p className="text-xs text-gray-400 flex items-center justify-center gap-1 mt-2">
                  <RefreshCw size={12} className="animate-spin" />
                  Vérification automatique toutes les 5 secondes...
                </p>
              </div>
            </div>
          )}

          {isConnected && !qrCode && (
            <div className="bg-green-50 rounded-xl p-4 text-sm text-green-800 space-y-2">
              <p className="font-semibold">✅ WhatsApp est opérationnel !</p>
              <ul className="list-disc list-inside space-y-1 pl-2 text-green-700">
                <li><code className="bg-green-100 px-1 rounded">/post 5 [site]</code> — Publie 5 articles</li>
                <li><code className="bg-green-100 px-1 rounded">/sites</code> — Liste vos sites</li>
                <li><code className="bg-green-100 px-1 rounded">/status</code> — Rapport d&apos;activité</li>
                <li><code className="bg-green-100 px-1 rounded">/help</code> — Aide complète</li>
              </ul>
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            {!isConnected && (
              <button id="whatsapp-connect-btn" onClick={handleConnect} disabled={connecting || loading}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium px-5 py-2.5 rounded-xl transition-all shadow-sm">
                <Smartphone size={16} />
                {connecting ? 'Génération...' : qrCode ? 'Rafraîchir le QR' : 'Connecter un numéro'}
              </button>
            )}
            {isConnected && (
              <button id="whatsapp-logout-btn" onClick={handleLogout} disabled={loggingOut}
                className="flex items-center gap-2 bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-600 font-medium px-5 py-2.5 rounded-xl transition-all border border-red-200">
                <LogOut size={16} />
                {loggingOut ? 'Déconnexion...' : 'Déconnecter'}
              </button>
            )}
            <button id="whatsapp-refresh-btn" onClick={fetchStatus} disabled={loading}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Rafraîchir
            </button>
          </div>
        </div>
      </div>

      {/* Allowlist Management Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-blue-500" />
          <h2 className="font-semibold text-gray-800">Numéros autorisés</h2>
          <span className={`ml-auto text-xs px-2 py-1 rounded-full font-medium ${
            allowedNumbers.length > 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {allowedNumbers.length > 0 ? `${allowedNumbers.length} numéro(s)` : 'Tous acceptés ⚠️'}
          </span>
        </div>

        <p className="text-sm text-gray-500">
          Si la liste est vide, <strong>tous les messages sont acceptés</strong>. Ajoutez au moins un numéro pour restreindre l&apos;accès.
        </p>

        {/* Add form */}
        <form onSubmit={handleAddNumber} className="flex gap-2 flex-wrap">
          <input
            id="whatsapp-phone-input"
            type="text"
            placeholder="Ex: 33612345678"
            value={newPhone}
            onChange={e => setNewPhone(e.target.value.replace(/\D/g, ''))}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm flex-1 min-w-[150px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            id="whatsapp-label-input"
            type="text"
            placeholder="Nom / label (optionnel)"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm flex-1 min-w-[150px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" disabled={addLoading || !newPhone.trim()}
            id="whatsapp-add-number-btn"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium px-4 py-2 rounded-xl text-sm transition-all">
            <Plus size={15} />
            Ajouter
          </button>
        </form>
        {addError && <p className="text-sm text-red-600">{addError}</p>}

        {/* Numbers list */}
        {allowedNumbers.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <UserCheck size={32} className="mx-auto mb-2 opacity-30" />
            Aucun numéro autorisé pour l&apos;instant
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {allowedNumbers.map(n => (
              <li key={n.id} className="flex items-center gap-3 py-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-xs font-bold">
                  {n.label ? n.label[0].toUpperCase() : n.phoneNumber[0]}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    +{n.phoneNumber}
                    {n.label && <span className="ml-2 text-gray-500 font-normal text-xs">({n.label})</span>}
                  </p>
                  <p className="text-xs text-gray-400">
                    Ajouté le {new Date(n.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(n.id)}
                  disabled={deletingId === n.id}
                  className="text-gray-400 hover:text-red-500 transition p-1 rounded-lg hover:bg-red-50 disabled:opacity-40"
                  title="Supprimer"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
