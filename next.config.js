/** @type {import('next').NextConfig} */

// Headers de sécurité appliqués globalement.
// CSP délibérément non incluse pour l'instant (Next.js + tailwind + recharts +
// Cloudinary + sites WP externes nécessitent une CSP dynamique non triviale —
// à ajouter dans une itération dédiée).
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '*.cloudinary.com' },
    ],
  },
  async headers() {
    return [
      {
        // Tous les paths sauf API (les API renvoient leurs propres headers selon le besoin)
        source: '/((?!api/).*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
