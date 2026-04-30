export async function sendWhatsAppMessage(instance: string, jid: string, text: string) {
  const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${instance}`;
  const apiKey = process.env.EVOLUTION_API_KEY;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey || '',
      },
      body: JSON.stringify({
        number: jid,
        text: text,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error('Evolution API Error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error);
    return false;
  }
}
