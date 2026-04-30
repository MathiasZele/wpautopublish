import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getArticleQueue } from '@/lib/queue';
import { sendWhatsAppMessage } from '@/lib/evolution';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Evolution API typical message structure
    // event: "messages.upsert"
    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored' });
    }

    const message = body.data;
    const remoteJid = message.key.remoteJid;
    const instanceName = body.instance;
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';

    // Security: Allowlist — ignore messages from unauthorized numbers
    const allowedNumbers = (process.env.ALLOWED_WHATSAPP_NUMBERS || '')
      .split(',')
      .map(n => n.trim())
      .filter(Boolean);

    if (allowedNumbers.length > 0) {
      // remoteJid format: "33612345678@s.whatsapp.net"
      const senderNumber = remoteJid.replace(/@.+$/, '');
      if (!allowedNumbers.includes(senderNumber)) {
        return NextResponse.json({ status: 'unauthorized' });
      }
    }

    if (!text) return NextResponse.json({ status: 'no_text' });

    const lowText = text.toLowerCase();

    // 1. Commande /help
    if (lowText.startsWith('/help') || lowText.startsWith('/aide')) {
      const help = `🤖 *Aide WP-Autopublish*

/post [nb] [site] : Publie X articles
/sites : Liste vos sites connectés
/status : État des dernières requêtes

Exemple : \`/post 5 iBusiness\``;
      await sendWhatsAppMessage(instanceName, remoteJid, help);
      return NextResponse.json({ status: 'help_sent' });
    }

    // 2. Commande /sites
    if (lowText.startsWith('/sites')) {
      const websites = await prisma.website.findMany({
        orderBy: { name: 'asc' }
      });
      if (websites.length === 0) {
        await sendWhatsAppMessage(instanceName, remoteJid, "📪 Aucun site n'est encore configuré.");
      } else {
        const list = websites.map(w => `- *${w.name}* (${w.status === 'ACTIVE' ? '✅' : '⚠️'})`).join('\n');
        await sendWhatsAppMessage(instanceName, remoteJid, `📑 *Vos sites connectés :*\n\n${list}`);
      }
      return NextResponse.json({ status: 'sites_listed' });
    }

    // 3. Commande /status
    if (lowText.startsWith('/status')) {
      const lastRequests = await prisma.whatsAppRequest.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' }
      });

      if (lastRequests.length === 0) {
        await sendWhatsAppMessage(instanceName, remoteJid, "📭 Aucune requête récente.");
      } else {
        const statusList = lastRequests.map(r => 
          `🕒 ${new Date(r.createdAt).toLocaleDateString('fr-FR')} : ${r.status === 'COMPLETED' ? '✅' : '⏳'} (${r.successCount}/${r.totalCount})`
        ).join('\n');
        await sendWhatsAppMessage(instanceName, remoteJid, `📊 *Dernières activités WhatsApp :*\n\n${statusList}`);
      }
      return NextResponse.json({ status: 'status_sent' });
    }

    // 4. Commande /post (ou ancienne syntaxe)
    const postMatch = text.match(/^\/post\s+(\d+)\s+(.+)/i) || text.match(/^(?:post|publie|lancer|go)\s+(\d+)\s+(.+)/i);
    
    if (postMatch) {
      const count = Math.min(parseInt(postMatch[1]), 20); // Cap à 20 articles
      const siteQuery = postMatch[2].trim();

      const websites = await prisma.website.findMany();
      const website = websites.find(w => 
        w.name.toLowerCase().includes(siteQuery.toLowerCase()) || 
        siteQuery.toLowerCase().includes(w.name.toLowerCase())
      );

      if (!website) {
        await sendWhatsAppMessage(instanceName, remoteJid, `❌ Site "${siteQuery}" non trouvé.`);
        return NextResponse.json({ status: 'site_not_found' });
      }

      const waRequest = await prisma.whatsAppRequest.create({
        data: {
          senderJid: remoteJid,
          instanceId: instanceName,
          websiteId: website.id,
          totalCount: count,
          status: 'PENDING'
        }
      });

      const articleQueue = getArticleQueue();
      for (let i = 0; i < count; i++) {
        await articleQueue.add('auto-article', {
          websiteId: website.id,
          mode: 'AUTO',
          autoCategorize: true,
          whatsAppRequestId: waRequest.id
        });
      }

      await sendWhatsAppMessage(instanceName, remoteJid, `✅ Lancement de *${count} articles* pour *${website.name}*.\n\nJe vous enverrai les liens une fois terminé. 🚀`);
      return NextResponse.json({ status: 'success' });
    }

    return NextResponse.json({ status: 'unknown_command' });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
