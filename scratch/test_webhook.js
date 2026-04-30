async function testWebhook() {
  try {
    const response = await fetch('https://wpautopublish-production.up.railway.app/api/webhooks/evolution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'messages.upsert',
        instance: 'WPAutoPublish',
        data: {
          key: {
            remoteJid: '237698497839@s.whatsapp.net',
            fromMe: false,
            id: 'TEST_ID'
          },
          message: {
            conversation: '/help'
          }
        }
      })
    });
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Data:', data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testWebhook();
