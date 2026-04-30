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

    if (!text) return NextResponse.json({ status: 'no_text' });

    // Pattern: [Action] [Number] [SiteName]
    // Example: "Post 5 iBusiness" or "Publie 3 Africa"
    const match = text.match(/(?:post|publie|lancer|go)\s+(\d+)\s+(.+)/i);
    
    if (!match) {
      // If user just says hello or something, we can respond with help
      if (text.toLowerCase().includes('help') || text.toLowerCase().includes('aide')) {
        await sendWhatsAppMessage(instanceName, remoteJid, "🤖 *Aide WP-Autopublish*\n\nPour lancer des articles, envoyez :\n`Post [nombre] [Nom du site]`\n\nExemple : `Post 5 iBusiness`.");
      }
      return NextResponse.json({ status: 'no_match' });
    }

    const count = parseInt(match[1]);
    const siteQuery = match[2].trim();

    // Find the website
    const websites = await prisma.website.findMany();
    const website = websites.find(w => 
      w.name.toLowerCase().includes(siteQuery.toLowerCase()) || 
      siteQuery.toLowerCase().includes(w.name.toLowerCase())
    );

    if (!website) {
      await sendWhatsAppMessage(instanceName, remoteJid, `❌ Site "${siteQuery}" non trouvé.`);
      return NextResponse.json({ status: 'site_not_found' });
    }

    // Create a request entry to track completion
    const waRequest = await prisma.whatsAppRequest.create({
      data: {
        senderJid: remoteJid,
        instanceId: instanceName,
        websiteId: website.id,
        totalCount: count,
        status: 'PENDING'
      }
    });

    // Add jobs to queue
    const articleQueue = getArticleQueue();
    for (let i = 0; i < count; i++) {
      await articleQueue.add('auto-article', {
        websiteId: website.id,
        mode: 'AUTO',
        autoCategorize: true,
        whatsAppRequestId: waRequest.id
      });
    }

    await sendWhatsAppMessage(instanceName, remoteJid, `✅ Lancement de *${count} articles* pour *${website.name}*.\n\nJe vous enverrai les liens une fois terminé.`);

    return NextResponse.json({ status: 'success' });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
