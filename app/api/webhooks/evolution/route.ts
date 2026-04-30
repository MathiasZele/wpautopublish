import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getArticleQueue } from '@/lib/queue';
import { sendWhatsAppMessage } from '@/lib/evolution';
import { changeWordPressPostStatus } from '@/lib/wordpress';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Evolution API typical message structure
    // event: "messages.upsert"
    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored' });
    }

    const instanceName = body.instance;
    console.log('Webhook received:', body.event, instanceName);

    const message = body.data;
    const remoteJid = message.key.remoteJid;
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    console.log('Sender:', remoteJid, 'Text:', text);

    // Security: Allowlist — check against DB-managed allowed numbers
    console.log('Checking allowlist...');
    const allowedNumbers = await prisma.whatsAppAllowedNumber.findMany({ select: { phoneNumber: true } });
    console.log('Allowed numbers count:', allowedNumbers.length);

    if (allowedNumbers.length > 0) {
      // remoteJid format: "33612345678@s.whatsapp.net"
      const senderNumber = remoteJid.replace(/@.+$/, '');
      const isAllowed = allowedNumbers.some(n => n.phoneNumber === senderNumber);
      console.log('Is sender allowed?', isAllowed, senderNumber);
      if (!isAllowed) {
        return NextResponse.json({ status: 'unauthorized' });
      }
    }



    if (!text) return NextResponse.json({ status: 'no_text' });

    // ─── GESTION DES SESSIONS (Multi-étapes) ──────────────────────────────────
    const session = await prisma.whatsAppSession.findUnique({
      where: { senderJid: remoteJid }
    });

    if (session) {
      if (session.step === 'WAITING_FOR_TEXT') {
        const website = await prisma.website.findUnique({ where: { id: session.websiteId } });
        if (!website) {
          await prisma.whatsAppSession.delete({ where: { id: session.id } });
          return NextResponse.json({ status: 'session_reset_site_missing' });
        }

        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { 
            step: 'WAITING_FOR_IMAGE',
            data: { text: text }
          }
        });

        await sendWhatsAppMessage(instanceName, remoteJid, "📥 Texte reçu ! Maintenant, envoyez l'URL d'une image ou tapez *'auto'* pour utiliser l'IA génératrice d'images.");
        return NextResponse.json({ status: 'session_step_2' });
      }

      if (session.step === 'WAITING_FOR_IMAGE') {
        const sessionData = session.data as any;
        const website = await prisma.website.findUnique({ where: { id: session.websiteId } });
        
        if (!website) {
          await prisma.whatsAppSession.delete({ where: { id: session.id } });
          return NextResponse.json({ status: 'session_reset_site_missing' });
        }

        const imageUrl = text.toLowerCase() === 'auto' ? null : text;
        
        // Ajouter à la queue pour traitement (reformulation + publication)
        const articleQueue = getArticleQueue();
        await articleQueue.add('auto-article', {
          websiteId: website.id,
          mode: 'MANUAL',
          manualInput: sessionData.text,
          manualImageUrl: imageUrl || undefined,
          autoCategorize: true
        });

        await prisma.whatsAppSession.delete({ where: { id: session.id } });
        await sendWhatsAppMessage(instanceName, remoteJid, `🚀 L'article est en cours de reformulation et sera publié sur *${website.name}* dans quelques instants !`);
        return NextResponse.json({ status: 'session_completed' });
      }
    }

    // ─── FILTRE COMMANDES (Doit commencer par /) ─────────────────────────────
    if (!text.startsWith('/')) {
      console.log('Ignoring non-command message');
      return NextResponse.json({ status: 'not_a_command' });
    }

    const lowText = text.toLowerCase();

    // 1. Commande /help
    if (lowText.startsWith('/help') || lowText.startsWith('/aide')) {
      const help = `🤖 *Aide WP-Autopublish*

/post [nb] [site] [brouillon] : Publie X articles
/direct [site] : Publie un article à partir de votre texte
/supprimer [lien] : Met l'article à la corbeille WP
/brouillon [lien] : Repasse l'article en brouillon WP
/sites : Liste vos sites connectés
/status : État des dernières requêtes
/vider-historique : Vide l'historique WhatsApp

Exemple : \`/post 5 iBusiness brouillon\``;
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

    // 4. Commande /vider-historique
    if (lowText.startsWith('/vider-historique')) {
      const deleted = await prisma.whatsAppRequest.deleteMany({});
      await sendWhatsAppMessage(instanceName, remoteJid, `🧹 Historique WhatsApp vidé (${deleted.count} requêtes supprimées).`);
      return NextResponse.json({ status: 'history_cleared' });
    }

    // 5. Commande /supprimer <lien>
    const deleteMatch = text.match(/^\/supprimer\s+(https?:\/\/[^\s]+)/i);
    if (deleteMatch) {
      const targetUrl = deleteMatch[1].trim();
      const log = await prisma.articleLog.findFirst({
        where: { wpPostUrl: targetUrl },
        include: { website: true }
      });

      if (!log || !log.wpPostId) {
        await sendWhatsAppMessage(instanceName, remoteJid, `❌ Impossible de trouver cet article dans l'historique.`);
        return NextResponse.json({ status: 'not_found' });
      }

      const success = await changeWordPressPostStatus(log.website, log.wpPostId, 'trash');
      if (success) {
        await sendWhatsAppMessage(instanceName, remoteJid, `🗑️ L'article a été mis à la corbeille avec succès !`);
      } else {
        await sendWhatsAppMessage(instanceName, remoteJid, `⚠️ Échec de la suppression sur WordPress.`);
      }
      return NextResponse.json({ status: 'deleted' });
    }

    // 6. Commande /brouillon <lien>
    const draftMatch = text.match(/^\/brouillon\s+(https?:\/\/[^\s]+)/i);
    if (draftMatch) {
      const targetUrl = draftMatch[1].trim();
      const log = await prisma.articleLog.findFirst({
        where: { wpPostUrl: targetUrl },
        include: { website: true }
      });

      if (!log || !log.wpPostId) {
        await sendWhatsAppMessage(instanceName, remoteJid, `❌ Impossible de trouver cet article dans l'historique.`);
        return NextResponse.json({ status: 'not_found' });
      }

      const success = await changeWordPressPostStatus(log.website, log.wpPostId, 'draft');
      if (success) {
        await sendWhatsAppMessage(instanceName, remoteJid, `📝 L'article a été repassé en brouillon avec succès !`);
      } else {
        await sendWhatsAppMessage(instanceName, remoteJid, `⚠️ Échec de la mise en brouillon sur WordPress.`);
      }
      return NextResponse.json({ status: 'drafted' });
    }

    // 7. Commande /direct [site]
    const directMatch = text.match(/^\/direct\s+(.+)/i);
    if (directMatch) {
      const siteQuery = directMatch[1].trim();
      const websites = await prisma.website.findMany();
      const website = websites.find(w => 
        w.name.toLowerCase().includes(siteQuery.toLowerCase()) || 
        siteQuery.toLowerCase().includes(w.name.toLowerCase())
      );

      if (!website) {
        await sendWhatsAppMessage(instanceName, remoteJid, `❌ Site "${siteQuery}" non trouvé.`);
        return NextResponse.json({ status: 'site_not_found' });
      }

      await prisma.whatsAppSession.upsert({
        where: { senderJid: remoteJid },
        update: { step: 'WAITING_FOR_TEXT', websiteId: website.id, data: {} },
        create: { senderJid: remoteJid, step: 'WAITING_FOR_TEXT', websiteId: website.id, data: {} }
      });

      await sendWhatsAppMessage(instanceName, remoteJid, `📝 *Mode Direct pour ${website.name}*\n\nVeuillez envoyer le texte de votre article (il sera reformulé et formaté par l'IA).`);
      return NextResponse.json({ status: 'direct_mode_started' });
    }

    // 8. Commande /post (ou ancienne syntaxe)
    const postMatch = text.match(/^\/post\s+(\d+)\s+(.+?)(?:\s+(brouillon|draft))?$/i);
    
    if (postMatch) {
      const count = Math.min(parseInt(postMatch[1]), 20); // Cap à 20 articles
      const siteQuery = postMatch[2].trim();
      const isDraftMode = !!postMatch[3];

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
          draftMode: isDraftMode,
          whatsAppRequestId: waRequest.id,
          articleIndex: i
        });
      }

      const statusStr = isDraftMode ? "en *brouillon*" : "en publication direct";
      await sendWhatsAppMessage(instanceName, remoteJid, `✅ Lancement de *${count} articles* pour *${website.name}* (${statusStr}).\n\nJe vous enverrai les liens une fois terminé. 🚀`);
      return NextResponse.json({ status: 'success' });
    }

    return NextResponse.json({ status: 'unknown_command' });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
