import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getArticleQueue } from '@/lib/queue';
import { sendWhatsAppMessage, getMediaBase64 } from '@/lib/evolution';
import { changeWordPressPostStatus, getWordPressPostInfo, fetchWordPressCategories } from '@/lib/wordpress';
import { uploadImageFromBuffer } from '@/lib/cloudinary';
import { decrypt } from '@/lib/encryption';
import { consume, webhookLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'webhook:evolution' });

function checkWebhookAuth(authHeader: string | null): boolean {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!secret) {
    log.error('EVOLUTION_WEBHOOK_SECRET not configured — refusing all requests');
    return false;
  }
  const provided = (authHeader ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('apikey') || req.headers.get('authorization');
    if (!checkWebhookAuth(authHeader)) {
      log.warn('unauthorized webhook attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    
    // Evolution API typical message structure
    // event: "messages.upsert"
    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ status: 'ignored' });
    }

    const instanceName = body.instance;
    log.debug({ event: body.event, instanceName }, 'Webhook received');

    const message = body.data;
    const remoteJid = message.key.remoteJid;

    // Détection récursive de l'image pour gérer ephemeralMessage, viewOnceMessage, documentMessage, etc.
    // depth borné à 5 pour éviter un stack overflow sur payload structuré malicieux.
    const findImageMessage = (msg: any, depth = 0): any => {
      if (!msg || depth > 5) return null;
      if (msg.imageMessage) return msg.imageMessage;
      if (msg.documentMessage && msg.documentMessage.mimetype?.startsWith('image/')) {
        return msg.documentMessage;
      }
      if (msg.viewOnceMessage?.message) return findImageMessage(msg.viewOnceMessage.message, depth + 1);
      if (msg.ephemeralMessage?.message) return findImageMessage(msg.ephemeralMessage.message, depth + 1);
      return null;
    };

    const imageMsg = findImageMessage(message.message);
    const isImage = !!imageMsg;

    const text = message.message?.conversation ||
                 message.message?.extendedTextMessage?.text ||
                 imageMsg?.caption ||
                 imageMsg?.fileName ||
                 '';

    // Logs sans PII : on tronque le numéro et on log juste la longueur du message.
    const senderHash = typeof remoteJid === 'string' ? remoteJid.slice(-6) : '?';
    log.info({ senderHash, isImage, textLen: text.length }, 'wa message received');

    // Si pas de texte ET pas d'image, on ignore (permet de laisser passer les images sans texte)
    if (!text && !isImage) {
      log.debug('Ignoring message: no text and no image detected');
      return NextResponse.json({ status: 'no_content' });
    }

    // Ignorer les messages de groupes/broadcasts AVANT toute requête DB (économise latence + bruit logs)
    if (typeof remoteJid === 'string' && (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast'))) {
      return NextResponse.json({ status: 'ignored_group' });
    }

    // Ignorer les messages de soi-même (fromMe = true)
    if (message.key?.fromMe === true) {
      return NextResponse.json({ status: 'ignored_self' });
    }

    // Security: Allowlist — résolution du userId à partir du numéro envoyeur.
    // Le numéro doit être whitelisté ET on récupère son owner pour scoper toutes
    // les requêtes ultérieures (sites, articles, historique).
    if (typeof remoteJid !== 'string') {
      return NextResponse.json({ status: 'invalid_jid' });
    }
    const senderNumber = remoteJid.replace(/@.+$/, '');
    const allowed = await prisma.whatsAppAllowedNumber.findFirst({
      where: { phoneNumber: senderNumber },
      select: { userId: true },
    });
    if (!allowed) {
      return NextResponse.json({ status: 'unauthorized' });
    }
    const ownerUserId = allowed.userId;

    // Rate limit par numéro envoyeur : 60 messages / min (post résolution allowlist
    // pour ne pas pénaliser les pings non autorisés qui sont déjà rejetés).
    const wlLimited = await consume(webhookLimit, senderNumber);
    if (wlLimited) {
      return NextResponse.json({ status: 'rate_limited' }, { status: 429 });
    }

    if (!text && !isImage) return NextResponse.json({ status: 'no_text' });

    // ─── GESTION DES SESSIONS (Multi-étapes) ──────────────────────────────────
    const session = await prisma.whatsAppSession.findUnique({
      where: { senderJid: remoteJid }
    });

    if (session) {
      if (session.step === 'WAITING_FOR_TEXT') {
        const website = await prisma.website.findFirst({ where: { id: session.websiteId, userId: ownerUserId } });
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

        await sendWhatsAppMessage(instanceName, remoteJid, "📥 Texte reçu ! Maintenant, vous pouvez :\n- Envoyer directement une *image* 🖼️\n- Envoyer l'URL d'une image\n- Taper *'auto'* pour laisser l'IA choisir.");
        return NextResponse.json({ status: 'session_step_2' });
      }

      if (session.step === 'WAITING_FOR_IMAGE') {
        const sessionData = session.data as any;
        const website = await prisma.website.findFirst({ where: { id: session.websiteId, userId: ownerUserId } });
        
        if (!website) {
          await prisma.whatsAppSession.delete({ where: { id: session.id } });
          return NextResponse.json({ status: 'session_reset_site_missing' });
        }

        let imageUrl: string | undefined = undefined;

        log.debug({ step: 'WAITING_FOR_IMAGE', isImage, textLen: text.length }, 'Session step');

        if (isImage) {
          await sendWhatsAppMessage(instanceName, remoteJid, "⏳ Traitement de l'image...");
          const base64 = await getMediaBase64(instanceName, message.key);
          if (!base64) {
            log.error('base64 fetch failed');
            await sendWhatsAppMessage(instanceName, remoteJid, "⚠️ Impossible de récupérer l'image. Veuillez réessayer ou envoyer un lien.");
            return NextResponse.json({ status: 'image_fetch_failed' });
          }

          // Anti-DoS : la taille en bytes est environ 0.75 × longueur base64.
          // 10 MB max → ~13.4 MB de base64.
          const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
          const estimatedBytes = Math.floor(base64.length * 0.75);
          if (estimatedBytes > MAX_IMAGE_BYTES) {
            log.warn({ estimatedBytes, max: MAX_IMAGE_BYTES }, 'image too large, rejected');
            await sendWhatsAppMessage(instanceName, remoteJid, "⚠️ Image trop volumineuse (max 10 MB). Veuillez en envoyer une plus petite.");
            return NextResponse.json({ status: 'image_too_large' });
          }

          const buffer = Buffer.from(base64, 'base64');
          if (buffer.length > MAX_IMAGE_BYTES) {
            await sendWhatsAppMessage(instanceName, remoteJid, "⚠️ Image trop volumineuse (max 10 MB).");
            return NextResponse.json({ status: 'image_too_large' });
          }
          imageUrl = await uploadImageFromBuffer(buffer, `whatsapp_${Date.now()}`);
        } else {
          // Gérer le texte (URL ou 'auto')
          if (text.toLowerCase() !== 'auto') {
            imageUrl = text;
          }
        }
        
        // Ajouter à la queue pour traitement (reformulation + publication)
        const articleQueue = getArticleQueue();
        await articleQueue.add('auto-article', {
          websiteId: website.id,
          mode: 'MANUAL',
          manualInput: sessionData.text,
          manualImageUrl: imageUrl,
          autoCategorize: true,
          formatOnly: sessionData.formatOnly === true,
          senderJid: remoteJid,
          instanceId: instanceName
        });

        await prisma.whatsAppSession.delete({ where: { id: session.id } });
        await sendWhatsAppMessage(instanceName, remoteJid, `🚀 L'article est en cours de reformulation et sera bientôt publié sur *${website.name}* !`);
        return NextResponse.json({ status: 'session_completed' });
      }
    }

    // ─── FILTRE COMMANDES (Doit commencer par /) ─────────────────────────────
    if (!text.startsWith('/')) {
      log.debug('Ignoring non-command message');
      return NextResponse.json({ status: 'not_a_command' });
    }

    const lowText = text.toLowerCase();

    // 1. Commande /help [commande]
    const helpMatch = text.match(/^\/(?:help|aide)(?:\s+\/?(\S+))?/i);
    if (helpMatch) {
      const sub = (helpMatch[1] || '').toLowerCase().replace(/^\//, '');
      const help = sub ? buildCommandHelp(sub) : buildHelpMenu();
      await sendWhatsAppMessage(instanceName, remoteJid, help);
      return NextResponse.json({ status: 'help_sent' });
    }

    // 1.b Commande /stop
    if (lowText.startsWith('/stop') || lowText.startsWith('/cancel')) {
      await prisma.whatsAppSession.deleteMany({ where: { senderJid: remoteJid } });
      await sendWhatsAppMessage(instanceName, remoteJid, "🛑 Action annulée. Session réinitialisée.");
      return NextResponse.json({ status: 'action_stopped' });
    }

    // 2. Commande /sites
    if (lowText.startsWith('/sites')) {
      const websites = await prisma.website.findMany({
        where: { userId: ownerUserId },
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

    // 2.b Commande /cats [site]
    const catsMatch = text.match(/^\/cats\s+(.+)/i);
    if (catsMatch) {
      const siteQuery = catsMatch[1].trim();
      const websites = await prisma.website.findMany({ where: { userId: ownerUserId } });
      const website = websites.find(w => 
        w.name.toLowerCase().includes(siteQuery.toLowerCase()) || 
        siteQuery.toLowerCase().includes(w.name.toLowerCase())
      );

      if (!website) {
        await sendWhatsAppMessage(instanceName, remoteJid, `❌ Site "${siteQuery}" non trouvé.`);
        return NextResponse.json({ status: 'site_not_found' });
      }

      await sendWhatsAppMessage(instanceName, remoteJid, `⏳ Récupération des catégories pour *${website.name}*...`);
      
      try {
        const cats = await fetchWordPressCategories(
          website.url, 
          website.wpUsername, 
          decrypt(website.wpAppPassword)
        );

        if (cats.length === 0) {
          await sendWhatsAppMessage(instanceName, remoteJid, `📪 Aucune catégorie trouvée sur ce site.`);
        } else {
          const list = cats.map(c => `• *${c.id}* : ${c.name}`).join('\n');
          await sendWhatsAppMessage(instanceName, remoteJid, `📂 *Catégories pour ${website.name} :*\n\n${list}\n\n_Utilisez ces IDs dans la commande /post._`);
        }
      } catch (e: any) {
        await sendWhatsAppMessage(instanceName, remoteJid, `⚠️ Erreur lors de la récupération : ${e.message}`);
      }
      return NextResponse.json({ status: 'cats_listed' });
    }

    // 3. Commande /status
    if (lowText.startsWith('/status')) {
      const lastRequests = await prisma.whatsAppRequest.findMany({
        where: { website: { userId: ownerUserId } },
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

    // 4. Commande /vider-historique (scopé au user via ses sites)
    if (lowText.startsWith('/vider-historique')) {
      const deleted = await prisma.whatsAppRequest.deleteMany({
        where: { website: { userId: ownerUserId } },
      });
      await sendWhatsAppMessage(instanceName, remoteJid, `🧹 Historique WhatsApp vidé (${deleted.count} requêtes supprimées).`);
      return NextResponse.json({ status: 'history_cleared' });
    }

    // 5. Commande /supprimer <lien>
    const deleteMatch = text.match(/^\/supprimer\s+(https?:\/\/[^\s]+)/i);
    if (deleteMatch) {
      const link = deleteMatch[1].trim();
      const log = await prisma.articleLog.findFirst({
        where: {
          wpPostUrl: { equals: link },
          website: { userId: ownerUserId },
        },
        include: { website: true },
        orderBy: { publishedAt: 'desc' }
      });

      if (!log || !log.wpPostId) {
        await sendWhatsAppMessage(instanceName, remoteJid, `❌ Impossible de trouver cet article dans l'historique.`);
        return NextResponse.json({ status: 'not_found' });
      }

      const result = await changeWordPressPostStatus(log.website, log.wpPostId, 'trash');
      if (result.success) {
        await sendWhatsAppMessage(instanceName, remoteJid, `🗑️ L'article a été mis à la corbeille avec succès !`);
      } else {
        await sendWhatsAppMessage(instanceName, remoteJid, `⚠️ Échec de la suppression sur WordPress. (Erreur: ${result.error})`);
      }
      return NextResponse.json({ status: 'deleted' });
    }

    // 6. Commande /brouillon <lien>
    const draftMatch = text.match(/^\/brouillon\s+(https?:\/\/[^\s]+)/i);
    if (draftMatch) {
      const link = draftMatch[1].trim();
      const log = await prisma.articleLog.findFirst({
        where: {
          wpPostUrl: { equals: link },
          website: { userId: ownerUserId },
        },
        include: { website: true },
        orderBy: { publishedAt: 'desc' }
      });

      if (!log || !log.wpPostId) {
        await sendWhatsAppMessage(instanceName, remoteJid, `❌ Impossible de trouver cet article dans l'historique.`);
        return NextResponse.json({ status: 'not_found' });
      }

      const result = await changeWordPressPostStatus(log.website, log.wpPostId, 'draft');
      if (result.success) {
        await sendWhatsAppMessage(instanceName, remoteJid, `📝 L'article a été repassé en brouillon avec succès !`);
      } else {
        await sendWhatsAppMessage(instanceName, remoteJid, `⚠️ Échec de la mise en brouillon sur WordPress. (Erreur: ${result.error})`);
      }
      return NextResponse.json({ status: 'drafted' });
    }

    // 6.b Commande /publier <lien>
    const publishMatch = text.match(/^\/publier\s+(https?:\/\/[^\s]+)/i);
    if (publishMatch) {
      const link = publishMatch[1].trim();
      const log = await prisma.articleLog.findFirst({
        where: {
          wpPostUrl: { equals: link },
          website: { userId: ownerUserId },
        },
        include: { website: true },
        orderBy: { publishedAt: 'desc' }
      });

      if (!log || !log.wpPostId) {
        await sendWhatsAppMessage(instanceName, remoteJid, `❌ Impossible de trouver cet article dans l'historique.`);
        return NextResponse.json({ status: 'not_found' });
      }

      const result = await changeWordPressPostStatus(log.website, log.wpPostId, 'publish');
      if (result.success) {
        await sendWhatsAppMessage(instanceName, remoteJid, `✅ L'article a été publié avec succès !`);
      } else {
        await sendWhatsAppMessage(instanceName, remoteJid, `⚠️ Échec de la publication sur WordPress. (Erreur: ${result.error})`);
      }
      return NextResponse.json({ status: 'published' });
    }

    // 6.c Commande /info <lien>
    const infoMatch = text.match(/^\/info\s+(https?:\/\/[^\s]+)/i);
    if (infoMatch) {
      const link = infoMatch[1].trim();
      
      // Recherche plus robuste : on cherche l'URL exacte ou qui contient le lien fourni
      const log = await prisma.articleLog.findFirst({
        where: {
          wpPostUrl: { equals: link },
          website: { userId: ownerUserId },
        },
        include: { website: true },
        orderBy: { publishedAt: 'desc' }
      });

      if (!log || !log.wpPostId) {
        await sendWhatsAppMessage(instanceName, remoteJid, `❌ Impossible de trouver cet article dans l'historique.`);
        return NextResponse.json({ status: 'not_found' });
      }

      const info = await getWordPressPostInfo(log.website, log.wpPostId);
      if (info) {
        const statusMap: any = { publish: '✅ Publié', draft: '📝 Brouillon', trash: '🗑️ Corbeille', future: '📅 Planifié' };
        const statusEmoji = statusMap[info.status] || info.status;
        await sendWhatsAppMessage(instanceName, remoteJid, `ℹ️ *Informations Article :*\n\n📌 *Titre :* ${info.title}\n📊 *Statut :* ${statusEmoji}\n🔗 *Lien :* ${info.link}`);
      } else {
        await sendWhatsAppMessage(instanceName, remoteJid, `⚠️ Impossible de récupérer les informations depuis WordPress.`);
      }
      return NextResponse.json({ status: 'info_sent' });
    }

    // 7. Commande /direct [site]
    const directMatch = text.match(/^\/direct\s+(.+)/i);
    if (directMatch) {
      const siteQuery = directMatch[1].trim();
      const websites = await prisma.website.findMany({ where: { userId: ownerUserId } });
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

    // 7.b Commande /format [site]
    const formatMatch = text.match(/^\/format\s+(.+)/i);
    if (formatMatch) {
      const siteQuery = formatMatch[1].trim();
      const websites = await prisma.website.findMany({ where: { userId: ownerUserId } });
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
        update: { step: 'WAITING_FOR_TEXT', websiteId: website.id, data: { formatOnly: true } },
        create: { senderJid: remoteJid, step: 'WAITING_FOR_TEXT', websiteId: website.id, data: { formatOnly: true } }
      });

      await sendWhatsAppMessage(instanceName, remoteJid, `✨ *Mode Formatage pour ${website.name}*\n\nVeuillez envoyer le texte exact de votre article. L'IA le mettra en page (HTML) et générera le SEO, sans en modifier le contenu.`);
      return NextResponse.json({ status: 'format_mode_started' });
    }

    // 8. Commande /post (ou ancienne syntaxe)
    const postMatch = text.match(/^\/post\s+(\d+)\s+(.+?)(?:\s+([\d,]+))?(?:\s+(brouillon|draft))?$/i);
    
    if (postMatch) {
      const count = Math.min(parseInt(postMatch[1]), 20); // Cap à 20 articles
      const siteQuery = postMatch[2].trim();
      const catIdsString = postMatch[3];
      const isDraftMode = !!postMatch[4];

      const categoryIds = catIdsString 
        ? catIdsString.split(',').map((id: string) => parseInt(id.trim())).filter((id: number) => !isNaN(id))
        : [];

      const websites = await prisma.website.findMany({ where: { userId: ownerUserId } });
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
          autoCategorize: categoryIds.length === 0, // Auto seulement si pas de catégories choisies
          categoryIds: categoryIds,
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
    log.error({ err: error }, 'Webhook error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── AIDE WHATSAPP ───────────────────────────────────────────────────────────

interface CommandDoc {
  syntax: string;
  description: string;
  examples: string[];
  notes?: string[];
}

const COMMAND_HELP: Record<string, CommandDoc> = {
  post: {
    syntax: '/post [nb] [site] [catégories] [brouillon]',
    description: 'Génère et publie automatiquement N articles à partir des actualités récentes (NewsAPI, GNews, Mediastack, Guardian).',
    examples: [
      '/post 3 iBusiness',
      '/post 5 iBusiness 12,45',
      '/post 2 iBusiness 12 brouillon',
    ],
    notes: [
      '`nb` : entre 1 et 20',
      '`site` : nom (ou partie du nom) du site, ex. `iBusiness`',
      '`catégories` (optionnel) : IDs séparés par des virgules. Sans, l\'IA choisit. Liste-les avec `/cats`',
      '`brouillon` (optionnel) : ajoute ce mot pour mettre les articles en brouillon WP au lieu de les publier',
    ],
  },

  cats: {
    syntax: '/cats [site]',
    description: 'Liste toutes les catégories WordPress du site avec leurs IDs (utiles pour `/post`).',
    examples: ['/cats iBusiness'],
  },

  direct: {
    syntax: '/direct [site]',
    description: 'Démarre un dialogue : tu envoies du texte (ou un titre), l\'IA reformule en article SEO complet et publie.',
    examples: ['/direct iBusiness'],
    notes: [
      'Étape 1 : tu envoies `/direct iBusiness`',
      'Étape 2 : tu envoies ton brief (texte, idée, titre)',
      'Étape 3 : tu envoies une image, ou une URL d\'image, ou tape `auto` pour que l\'IA en cherche une',
      'Annuler à tout moment avec `/stop`',
    ],
  },

  format: {
    syntax: '/format [site]',
    description: 'Comme `/direct` mais l\'IA NE REFORMULE PAS — elle met juste ton texte en HTML propre + génère le SEO. Idéal pour publier un texte que tu as déjà rédigé.',
    examples: ['/format iBusiness'],
    notes: [
      'Étape 1 : tu envoies `/format iBusiness`',
      'Étape 2 : tu envoies le texte exact à publier',
      'Étape 3 : image ou URL ou `auto`',
      'Le contenu n\'est PAS modifié, seulement structuré.',
    ],
  },

  publier: {
    syntax: '/publier [lien]',
    description: 'Repasse un article actuellement en brouillon ou corbeille en statut "publié" sur WordPress.',
    examples: ['/publier https://ibusiness.africa/?p=3979'],
  },

  brouillon: {
    syntax: '/brouillon [lien]',
    description: 'Remet un article publié en brouillon sur WordPress (le retire du site public).',
    examples: ['/brouillon https://ibusiness.africa/?p=3979'],
  },

  supprimer: {
    syntax: '/supprimer [lien]',
    description: 'Met l\'article à la corbeille WordPress (récupérable 30 jours par défaut).',
    examples: ['/supprimer https://ibusiness.africa/?p=3979'],
  },

  info: {
    syntax: '/info [lien]',
    description: 'Affiche le titre et le statut actuel (publié / brouillon / corbeille / planifié) d\'un article.',
    examples: ['/info https://ibusiness.africa/?p=3979'],
  },

  sites: {
    syntax: '/sites',
    description: 'Liste tous les sites WordPress connectés à ton compte avec leur état (✅ actif / ⚠️ erreur).',
    examples: ['/sites'],
  },

  status: {
    syntax: '/status',
    description: 'Affiche les 5 dernières requêtes lancées via WhatsApp, avec leur progression (terminé / en cours).',
    examples: ['/status'],
  },

  'vider-historique': {
    syntax: '/vider-historique',
    description: 'Supprime tout l\'historique des requêtes WhatsApp (logs des `/post`). N\'affecte pas les articles publiés sur WP.',
    examples: ['/vider-historique'],
  },

  stop: {
    syntax: '/stop',
    description: 'Annule la session multi-étapes en cours (`/direct` ou `/format`). Réinitialise.',
    examples: ['/stop'],
  },

  help: {
    syntax: '/help [commande]',
    description: 'Affiche le menu d\'aide. Avec un nom de commande, donne le détail et des exemples.',
    examples: ['/help', '/help post', '/help direct'],
  },
};

const COMMAND_ALIASES: Record<string, string> = {
  aide: 'help',
  cancel: 'stop',
  cat: 'cats',
};

function buildHelpMenu(): string {
  return `📖 *Aide WP-AUTOPUBLISH* by *NZM* 😎🦦

*Publication automatique :*
/post [nb] [site] [cats] [brouillon]

*Publication assistée IA :*
/direct [site] — IA reformule
/format [site] — IA formate seulement

*Gérer les articles :*
/publier [lien]
/brouillon [lien]
/supprimer [lien]
/info [lien]

*Infos :*
/sites — sites connectés
/cats [site] — catégories d'un site
/status — dernières activités

*Système :*
/help [commande] — détail d'une commande
/stop — annule l'action en cours
/vider-historique

💡 Tape *\`/help post\`* pour voir un exemple détaillé d'une commande.`;
}

function buildCommandHelp(name: string): string {
  const key = COMMAND_ALIASES[name] ?? name;
  const doc = COMMAND_HELP[key];
  if (!doc) {
    return `❓ Commande inconnue : *\`${name}\`*\n\nTape \`/help\` pour voir la liste des commandes disponibles.`;
  }

  const lines: string[] = [];
  lines.push(`📘 *Aide : /${key}*`);
  lines.push('');
  lines.push(`*Syntaxe :*\n\`${doc.syntax}\``);
  lines.push('');
  lines.push(`*À quoi ça sert :*\n${doc.description}`);
  if (doc.notes && doc.notes.length > 0) {
    lines.push('');
    lines.push('*Détails :*');
    lines.push(doc.notes.map(n => `• ${n}`).join('\n'));
  }
  if (doc.examples.length > 0) {
    lines.push('');
    lines.push('*Exemple' + (doc.examples.length > 1 ? 's' : '') + ' :*');
    lines.push(doc.examples.map(e => `\`${e}\``).join('\n'));
  }
  return lines.join('\n');
}
