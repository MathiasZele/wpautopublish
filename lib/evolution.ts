import { logger } from './logger';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!;
const log = logger.child({ module: 'evolution' });

const evolutionHeaders = {
  'Content-Type': 'application/json',
  'apikey': EVOLUTION_API_KEY || '',
};

// ─── Messaging ────────────────────────────────────────────────────────────────

export async function sendWhatsAppMessage(instance: string, jid: string, text: string) {
  const url = `${EVOLUTION_API_URL}/message/sendText/${instance}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: evolutionHeaders,
      body: JSON.stringify({ number: jid, text }),
    });
    if (!res.ok) {
      log.error({ status: res.status, body: await res.text() }, 'sendWhatsAppMessage failed');
      return false;
    }
    return true;
  } catch (err) {
    log.error({ err }, 'sendWhatsAppMessage network error');
    return false;
  }
}

// ─── Instance Management ──────────────────────────────────────────────────────

export type ConnectionState = 'open' | 'close' | 'connecting' | 'unknown';

export interface InstanceStatus {
  state: ConnectionState;
  instanceName: string;
  profilePictureUrl?: string | null;
  profileName?: string | null;
}

/**
 * Fetches the connection state of a given instance.
 */
export async function getWhatsAppStatus(instance: string): Promise<InstanceStatus> {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instance}`, {
      headers: evolutionHeaders,
      cache: 'no-store',
    });
    if (!res.ok) return { state: 'unknown', instanceName: instance };
    const data = await res.json();
    return {
      state: data?.instance?.state ?? 'unknown',
      instanceName: instance,
      profileName: data?.instance?.profileName ?? null,
      profilePictureUrl: data?.instance?.profilePictureUrl ?? null,
    };
  } catch {
    return { state: 'unknown', instanceName: instance };
  }
}

/**
 * Creates the instance if it doesn't exist, then returns the QR code (base64).
 * Returns null if the instance is already connected.
 */
export async function connectWhatsApp(instance: string): Promise<{ qrcode: string | null; pairingCode?: string | null }> {
  // First, check the status. If it's already open, we don't need a new QR code.
  const status = await getWhatsAppStatus(instance);
  
  // If it's already open, we don't return a QR code as it's already connected.
  if (status.state === 'open') {
    return { qrcode: null };
  }

  // If the instance exists but is not open, we delete it to ensure a fresh start with correct settings.
  if (status.state !== 'unknown') {
    log.info({ instance, state: status.state }, 'Recreating instance for fresh start');
    try {
      await fetch(`${EVOLUTION_API_URL}/instance/delete/${instance}`, {
        method: 'DELETE',
        headers: { 'apikey': EVOLUTION_API_KEY },
      });
    } catch (err) {
      log.warn({ err }, 'Failed to delete existing instance before recreation');
    }
  }

  // Determine App URL for webhook
  const appUrl = process.env.NEXT_PUBLIC_APP_URL 
    ? process.env.NEXT_PUBLIC_APP_URL 
    : (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');

  // Ensure instance exists or is recreated if stuck
  try {
    const createRes = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
      method: 'POST',
      headers: evolutionHeaders,
      body: JSON.stringify({
        instanceName: instance,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        webhook: appUrl ? {
          enabled: true,
          url: `${appUrl}/api/webhooks/evolution`,
          webhookByEvents: false,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        } : undefined,
      }),
    });

    if (!createRes.ok) {
      const errorData = await createRes.json().catch(() => ({}));
      log.warn({ status: createRes.status, errorData }, 'Evolution instance create non-OK');
    }
  } catch (err) {
    log.error({ err }, 'Error creating Evolution instance');
  }

  // Fetch QR code
  const res = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instance}`, {
    headers: evolutionHeaders,
    cache: 'no-store',
  });

  if (!res.ok) {
    log.error({ status: res.status, body: await res.text().catch(() => 'No body') }, 'Evolution connect failed');
    return { qrcode: null };
  }

  const data = await res.json().catch(() => ({}));
  
  // If the instance is already connected, it might return { instance: { state: 'open' } }
  if (data?.instance?.state === 'open') {
    return { qrcode: null };
  }

  return {
    qrcode: data?.base64 ?? data?.qrcode?.base64 ?? null,
    pairingCode: data?.pairingCode ?? null,
  };
}

/**
 * Disconnects the WhatsApp session for a given instance.
 * Tries to logout, and falls back to deleting the instance if stuck.
 */
export async function logoutWhatsApp(instance: string): Promise<boolean> {
  try {
    log.info({ instance }, 'Attempting logout');
    const res = await fetch(`${EVOLUTION_API_URL}/instance/logout/${instance}`, {
      method: 'DELETE',
      headers: evolutionHeaders,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'No error text');
      log.warn({ status: res.status, errorText, instance }, 'Evolution logout failed, trying force-delete');

      // If logout fails (e.g., 500 Connection Closed), we try to force delete the instance
      // to ensure the user can reconnect from scratch.
      const deleteRes = await fetch(`${EVOLUTION_API_URL}/instance/delete/${instance}`, {
        method: 'DELETE',
        headers: { 'apikey': EVOLUTION_API_KEY },
      });

      if (!deleteRes.ok) {
        log.error({ status: deleteRes.status, body: await deleteRes.text().catch(() => 'No body') }, 'Evolution delete failed');
        return false;
      }
      return true;
    }

    return true;
  } catch (err) {
    log.error({ err }, 'Evolution logout network error');
    return false;
  }
}

/**
 * Downloads media from Evolution API and returns it as a Buffer.
 */
export async function getMediaBase64(instance: string, messageKey: any): Promise<string | null> {
  const url = `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instance}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: evolutionHeaders,
      body: JSON.stringify({ 
        message: { key: messageKey },
        convertToMp4: true
      }),
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      log.error({ status: res.status, errorText }, 'Evolution getBase64 failed');
      return null;
    }

    const data = await res.json();
    return data.base64 || null;
  } catch (err) {
    log.error({ err }, 'Failed to get media base64');
    return null;
  }
}
