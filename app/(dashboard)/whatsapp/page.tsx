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

  // History state
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

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

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/whatsapp/logs');
      if (res.ok) setLogs(await res.json());
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchAllowedNumbers();
    fetchLogs();
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <MessageCircle className="text-green-500" size={28} />
            WhatsApp
          </h1>
          <p className="text-gray-500 mt-1">
            Connectez un numéro et gérez les accès pour publier via WhatsApp.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={logsLoading}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
          title="Actualiser l'historique"
        >
          <RefreshCw size={20} className={logsLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (Status & Numbers) */}
        <div className="lg:col-span-1 space-y-6">
          {/* Connection Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className={`px-6 py-4 flex items-center gap-3 ${
              isConnected ? 'bg-green-50 border-b border-green-100'
              : isConnecting ? 'bg-yellow-50 border-b border-yellow-100'
              : 'bg-gray-50 border-b border-gray-100'
            }`}>
              {isConnected ? <Wifi size={20} className="text-green-600" /> : <WifiOff size={20} className="text-gray-400" />}
              <div className="flex-1">
                <p className={`font-semibold text-sm ${isConnected ? 'text-green-700' : 'text-gray-600'}`}>
                  {loading ? 'Chargement...'
                    : isConnected ? `✅ Connecté`
                    : isConnecting ? '🔄 Connexion...'
                    : '⚫ Déconnecté'}
                </p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                  {status?.profileName || 'Instance active'}
                </p>
              </div>
              {isConnected && status?.profilePictureUrl && (
                <Image src={status.profilePictureUrl} alt="Profile" width={32} height={32}
                  className="rounded-full border-2 border-green-200" />
              )}
            </div>

            <div className="p-5 space-y-4">
              {qrCode && !isConnected && (
                <div className="flex flex-col items-center gap-4 py-2">
                  <div className="bg-white p-3 rounded-xl shadow-md border border-gray-200 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                      alt="QR Code" className="w-48 h-48"
                    />
                  </div>
                  <p className="text-xs text-gray-500 text-center leading-relaxed">
                    Scannez avec WhatsApp <br/>
                    <span className="font-medium text-gray-400">Appareils connectés → Associer</span>
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                {!isConnected && (
                  <button onClick={handleConnect} disabled={connecting || loading}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium py-2 rounded-xl text-sm transition-all shadow-sm">
                    {connecting ? '...' : qrCode ? 'Rafraîchir' : 'Connecter'}
                  </button>
                )}
                {isConnected && (
                  <button onClick={handleLogout} disabled={loggingOut}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2 rounded-xl text-sm transition-all border border-red-100">
                    {loggingOut ? '...' : 'Déconnecter'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Allowlist Management Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-blue-500" />
              <h2 className="font-semibold text-sm text-gray-800">Accès restreint</h2>
            </div>

            <form onSubmit={handleAddNumber} className="space-y-2">
              <input
                type="text"
                placeholder="Numéro (ex: 336...)"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value.replace(/\D/g, ''))}
                className="w-full border border-gray-100 bg-gray-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <button type="submit" disabled={addLoading || !newPhone.trim()}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2 rounded-xl text-sm transition-all">
                <Plus size={14} />
                Ajouter
              </button>
            </form>

            <div className="max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
              {allowedNumbers.length === 0 ? (
                <p className="text-[11px] text-gray-400 text-center py-4 italic">
                  Aucun numéro (tous acceptés ⚠️)
                </p>
              ) : (
                <ul className="space-y-2">
                  {allowedNumbers.map(n => (
                    <li key={n.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg group">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-700 truncate">+{n.phoneNumber}</p>
                        {n.label && <p className="text-[10px] text-gray-400 truncate">{n.label}</p>}
                      </div>
                      <button
                        onClick={() => handleDelete(n.id)}
                        disabled={deletingId === n.id}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (Logs / History) */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full min-h-[500px]">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw size={18} className="text-brand-500" />
                <h2 className="font-semibold text-gray-800">Historique des commandes</h2>
              </div>
              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                Dernières 50 requêtes
              </span>
            </div>

            <div className="flex-1 overflow-x-auto">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 py-20">
                  <MessageCircle size={48} className="opacity-10 mb-4" />
                  <p className="text-sm">Aucune activité enregistrée</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[11px] text-gray-400 uppercase tracking-wider bg-gray-50/50">
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 font-medium">Expéditeur</th>
                      <th className="px-6 py-3 font-medium">Action</th>
                      <th className="px-6 py-3 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-xs font-medium text-gray-600">
                            {new Date(log.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {new Date(log.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-xs font-semibold text-gray-700">
                            +{log.senderJid.split('@')[0]}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 font-medium">
                                {log.totalCount} article(s)
                              </span>
                              {log.articleLinks?.length > 0 && (
                                <span className="text-[10px] bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded border border-brand-100">
                                  {log.successCount} ✅
                                </span>
                              )}
                            </div>
                            {log.articleLinks?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1 max-w-[200px]">
                                {log.articleLinks.slice(0, 3).map((link: string, i: number) => (
                                  <a key={i} href={link} target="_blank" rel="noopener noreferrer" 
                                    className="text-[9px] text-brand-500 hover:underline bg-gray-50 px-1 rounded truncate max-w-[80px]">
                                    Article {i+1}
                                  </a>
                                ))}
                                {log.articleLinks.length > 3 && (
                                  <span className="text-[9px] text-gray-400">+{log.articleLinks.length - 3}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter ${
                            log.status === 'COMPLETED' ? 'bg-green-100 text-green-700'
                            : log.status === 'FAILED' ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700 animate-pulse'
                          }`}>
                            {log.status === 'COMPLETED' ? 'Succès' : log.status === 'FAILED' ? 'Échec' : 'En cours'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
  );
}
