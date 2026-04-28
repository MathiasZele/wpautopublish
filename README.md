# WP AutoPublish

Outil personnel Next.js 14 / PostgreSQL / OpenAI / WordPress pour piloter plusieurs sites WordPress en publication automatisée.

> Application personnelle multi-utilisateurs — aucune logique de plans, abonnements ou quotas.

## Stack

| Couche | Techno |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| DB | PostgreSQL (Railway) |
| ORM | Prisma |
| Auth | Auth.js v5 (Credentials) |
| Styles | Tailwind CSS + Lucide React |
| IA | OpenAI `gpt-4o-mini` |
| Queue | BullMQ + Redis (Railway) |
| News | NewsAPI.org |
| Images | Cloudinary |
| Cron | Railway Cron → `POST /api/cron/trigger` |

## Installation locale

```bash
npm install
cp .env.example .env.local      # remplir les valeurs
openssl rand -hex 32            # ENCRYPTION_KEY (32 bytes hex)
openssl rand -base64 32         # NEXTAUTH_SECRET, CRON_SECRET
npx prisma db push
npx prisma generate
npm run dev                     # http://localhost:3000
```

Dans un autre terminal :

```bash
npm run worker                  # lance le worker BullMQ
```

## Variables d'environnement

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL Railway |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | URL publique de l'app |
| `OPENAI_API_KEY` | Clé OpenAI |
| `NEWS_API_KEY` | NewsAPI.org |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary |
| `REDIS_URL` | Redis Railway |
| `CRON_SECRET` | Header `x-cron-secret` requis pour `/api/cron/trigger` |
| `ENCRYPTION_KEY` | 64 chars hex, chiffre les App Passwords WP |

## Plugin WordPress Helper

1. Copier `wp-helper-plugin/wp-autopublish-helper.php` dans `wp-content/plugins/wp-autopublish-helper/`.
2. Activer le plugin dans **wp-admin → Extensions**.
3. Aller dans **Réglages → WP AutoPublish** et coller la *clé secrète* générée par l'app lors de l'ajout du site.
4. Vérifier que l'utilisateur dispose d'un *Application Password* (Profil → Application Passwords).

## Workflow de publication

### Mode manuel
1. `/publish` dans le dashboard → choisir un site, saisir un sujet, optionnellement une URL d'image.
2. La requête appelle `POST /api/publish` qui empile un job dans BullMQ.
3. Le worker génère l'article via OpenAI, relaye l'image via Cloudinary si fournie, puis appelle l'endpoint REST du plugin.

### Mode automatique
1. Activer `autoMode` dans le profil du site et configurer `newsApiQuery`.
2. Configurer un Cron Service Railway pour appeler `POST /api/cron/trigger` (header `x-cron-secret: <CRON_SECRET>`).
3. Le cron itère tous les sites `ACTIVE` avec `autoMode=true` et empile `articlesPerDay` jobs (étalés d'1 minute).

## Déploiement Railway

1. **PostgreSQL** : ajouter le service "PostgreSQL". Copier `DATABASE_URL`.
2. **Redis** : ajouter le service "Redis". Copier `REDIS_URL`.
3. **App Next.js** : déployer ce repo. Build : `npm run build`. Start : `npm run start`.
4. **Worker** : créer un second service à partir du même repo, start command : `npm run worker`.
5. **Cron** : Railway Cron Service vers `https://<app>/api/cron/trigger` avec header `x-cron-secret`.
6. Renseigner toutes les variables d'env sur les deux services (app + worker).

## Sécurité

- App Passwords WordPress chiffrés en base (AES-256-GCM) via `lib/encryption.ts`.
- Toutes les routes API filtrent par `userId` de la session — un utilisateur ne voit que ses sites.
- L'endpoint `/api/cron/trigger` est protégé par `CRON_SECRET`.
- Le plugin WP utilise `hash_equals()` pour la comparaison de la clé secrète (timing-safe).

## Structure

```
app/
├── (auth)/{login,register}     pages publiques
├── (dashboard)/                pages protégées (sidebar)
│   ├── page.tsx                overview
│   ├── sites/                  liste, ajout, profil
│   ├── publish/                publication manuelle
│   └── history/                journal ArticleLog
└── api/
    ├── auth/[...nextauth]      handlers Auth.js
    ├── register                inscription
    ├── sites/                  CRUD + test connexion
    ├── publish                 enqueue manuel
    └── cron/trigger            enqueue auto

lib/
├── prisma.ts        client Prisma singleton
├── auth.ts          Auth.js v5 + Prisma adapter
├── encryption.ts    AES-256-GCM
├── openai.ts        prompts + parsing + pricing
├── newsapi.ts       NewsAPI.org
├── cloudinary.ts    relais images
├── wordpress.ts     publication + test connexion
└── queue.ts         BullMQ Queue singleton

workers/
└── article.worker.ts   processus BullMQ séparé

prisma/schema.prisma
wp-helper-plugin/wp-autopublish-helper.php
```

## Notes

- **Yoast SEO** : les meta-clés commencent toutes par underscore (`_yoast_wpseo_*`).
- **Images** : `media_handle_sideload` exige une URL publique → on relaye toujours via Cloudinary.
- **Workers** : process séparé de Next.js, à déployer comme service distinct.
