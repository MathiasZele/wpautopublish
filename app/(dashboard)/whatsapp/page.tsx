'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Shield,
  MessageCircle,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

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
  const [status, setStatus] = useState<InstanceStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [pollingId, setPollingId] = useState<ReturnType<typeof setInterval> | null>(null);

  const [allowedNumbers, setAllowedNumbers] = useState<AllowedNumber[]>([]);
  const [newPhone, setNewPhone] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
          if (pollingId) {
            clearInterval(pollingId);
            setPollingId(null);
          }
        }
      }
    } catch (e) {
      // pas critique
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

  useEffect(
    () => () => {
      if (pollingId) clearInterval(pollingId);
    },
    [pollingId],
  );

  const handleConnect = async () => {
    setConnecting(true);
    setQrCode(null);
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' });
      const data = await res.json();
      if (data.qrcode) {
        setQrCode(data.qrcode);
        const id = setInterval(fetchStatus, 5000);
        setPollingId(id);
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/whatsapp/logout', { method: 'POST' });
      setStatus((prev) => (prev ? { ...prev, state: 'close' } : null));
      setQrCode(null);
    } finally {
      setLoggingOut(false);
    }
  };

  const handleAddNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch('/api/whatsapp/allowed-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: newPhone.trim() }),
      });
      if (res.ok) {
        setNewPhone('');
        fetchAllowedNumbers();
      }
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/whatsapp/allowed-numbers/${id}`, { method: 'DELETE' });
      setAllowedNumbers((prev) => prev.filter((n) => n.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const isConnected = status?.state === 'open';
  const isConnecting = status?.state === 'connecting';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2.5">
            <MessageCircle className="h-5 w-5 text-success" />
            WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connectez un numéro et gérez les accès pour publier via WhatsApp.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchLogs}
          disabled={logsLoading}
          title="Actualiser l'historique"
        >
          <RefreshCw className={cn('h-4 w-4', logsLoading && 'animate-spin')} />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader
              className={cn(
                'flex-row items-center gap-3 space-y-0 py-3 px-4 border-b',
                isConnected
                  ? 'bg-success/5 border-success/20'
                  : isConnecting
                    ? 'bg-warning/5 border-warning/20'
                    : 'bg-muted/30',
              )}
            >
              {isConnected ? (
                <Wifi className="h-4 w-4 text-success" />
              ) : (
                <WifiOff className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className={cn('text-sm font-semibold', isConnected ? 'text-success' : '')}>
                  {loading
                    ? 'Chargement…'
                    : isConnected
                      ? 'Connecté'
                      : isConnecting
                        ? 'Connexion…'
                        : 'Déconnecté'}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {status?.profileName || 'Instance'}
                </p>
              </div>
              {isConnected && status?.profilePictureUrl && (
                <Image
                  src={status.profilePictureUrl}
                  alt="Profile"
                  width={32}
                  height={32}
                  className="rounded-full border-2 border-success/30"
                />
              )}
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {qrCode && !isConnected && (
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="bg-white p-3 rounded-md border inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                      alt="QR Code"
                      className="w-44 h-44"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Scannez avec WhatsApp <br />
                    <span className="font-medium">Appareils connectés → Associer</span>
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                {!isConnected && (
                  <Button
                    onClick={handleConnect}
                    disabled={connecting || loading}
                    className="flex-1 bg-success hover:bg-success/90"
                  >
                    {connecting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {connecting ? '…' : qrCode ? 'Rafraîchir' : 'Connecter'}
                  </Button>
                )}
                {isConnected && (
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                    onClick={handleLogout}
                    disabled={loggingOut}
                  >
                    {loggingOut && <Loader2 className="h-4 w-4 animate-spin" />}
                    {loggingOut ? '…' : 'Déconnecter'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Accès restreint
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="p-4 space-y-3">
              <form onSubmit={handleAddNumber} className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Numéro (ex: 336…)"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ''))}
                />
                <Button type="submit" size="icon" disabled={addLoading || !newPhone.trim()}>
                  {addLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </form>

              <div className="max-h-[220px] overflow-y-auto pr-1">
                {allowedNumbers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4 italic">
                    Aucun numéro (tous acceptés)
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {allowedNumbers.map((n) => (
                      <li
                        key={n.id}
                        className="flex items-center justify-between p-2 rounded-md hover:bg-accent/40 group transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-mono font-semibold truncate">
                            +{n.phoneNumber}
                          </p>
                          {n.label && (
                            <p className="text-[10px] text-muted-foreground truncate">{n.label}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(n.id)}
                          disabled={deletingId === n.id}
                        >
                          {deletingId === n.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="flex flex-col min-h-[500px]">
            <CardHeader className="flex-row items-center justify-between space-y-0 py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                Historique des commandes
              </CardTitle>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Dernières 50 requêtes
              </span>
            </CardHeader>
            <Separator />
            <div className="flex-1">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-20">
                  <MessageCircle className="h-12 w-12 opacity-10 mb-4" />
                  <p className="text-sm">Aucune activité enregistrée</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Expéditeur</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          <div>
                            {new Date(log.createdAt).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(log.createdAt).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          +{log.senderJid.split('@')[0]}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs">{log.totalCount} article(s)</span>
                              {log.articleLinks?.length > 0 && (
                                <Badge variant="success" className="text-[9px] py-0 h-4">
                                  {log.successCount} ok
                                </Badge>
                              )}
                            </div>
                            {log.articleLinks?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {log.articleLinks
                                  .slice(0, 3)
                                  .map((link: string, i: number) => (
                                    <a
                                      key={i}
                                      href={link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] text-primary hover:underline bg-muted px-1 rounded"
                                    >
                                      #{i + 1}
                                    </a>
                                  ))}
                                {log.articleLinks.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{log.articleLinks.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              log.status === 'COMPLETED'
                                ? 'success'
                                : log.status === 'FAILED'
                                  ? 'destructive'
                                  : 'default'
                            }
                            className={cn(
                              'text-[10px]',
                              log.status === 'PENDING' && 'animate-pulse',
                            )}
                          >
                            {log.status === 'COMPLETED'
                              ? 'Succès'
                              : log.status === 'FAILED'
                                ? 'Échec'
                                : 'En cours'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
