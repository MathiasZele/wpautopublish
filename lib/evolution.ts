const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!;

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
      console.error('Evolution API Error:', await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error);
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
  // Ensure instance exists
  try {
    await fetch(`${EVOLUTION_API_URL}/instance/create`, {
      method: 'POST',
      headers: evolutionHeaders,
      body: JSON.stringify({
        instanceName: instance,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        webhook: process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/evolution`
          : undefined,
        events: ['MESSAGES_UPSERT'],
      }),
    });
  } catch {
    // Instance may already exist — that's fine
  }

  // Fetch QR code
  const res = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instance}`, {
    headers: evolutionHeaders,
    cache: 'no-store',
  });

  if (!res.ok) return { qrcode: null };

  const data = await res.json();
  return {
    qrcode: data?.base64 ?? data?.qrcode?.base64 ?? null,
    pairingCode: data?.pairingCode ?? null,
  };
}

/**
 * Disconnects the WhatsApp session for a given instance.
 */
export async function logoutWhatsApp(instance: string): Promise<boolean> {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/instance/logout/${instance}`, {
      method: 'DELETE',
      headers: evolutionHeaders,
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Evolution logout failed (${res.status}):`, errorText);
      // If it returns 404, the instance might not exist or already be disconnected.
      if (res.status === 404) return true;
      return false;
    }
    return true;
  } catch (error) {
    console.error('Evolution logout network error:', error);
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
      console.error(`Evolution getBase64 failed (${res.status}):`, errorText);
      return null;
    }
    
    const data = await res.json();
    return data.base64 || null;
  } catch (error) {
    console.error('Failed to get media base64:', error);
    return null;
  }
}
