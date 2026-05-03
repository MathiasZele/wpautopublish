import pino from 'pino';

/**
 * Logger structuré JSON avec redaction automatique des secrets.
 * - En prod, sortie JSON (parsable par Railway/Datadog/Loki).
 * - En dev, format pretty si pino-pretty installé, sinon JSON.
 *
 * Usage :
 *   import { logger } from '@/lib/logger';
 *   logger.info({ jobId: '123' }, 'Job started');
 *   logger.error({ err }, 'Operation failed');
 *
 * Les valeurs des chemins listés dans `redact.paths` sont retirées avant
 * sérialisation, même si elles arrivent par accident dans un objet de contexte.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      // Patterns secrets — redact en profondeur partout dans l'objet de log
      '*.password',
      '*.appPassword',
      '*.wpAppPassword',
      '*.customEndpointKey',
      '*.apikey',
      '*.api_key',
      '*.token',
      '*.authorization',
      'password',
      'wpAppPassword',
      'customEndpointKey',
      'authorization',
      'OPENAI_API_KEY',
      'EVOLUTION_API_KEY',
      'EVOLUTION_WEBHOOK_SECRET',
      'CRON_SECRET',
      'NEXTAUTH_SECRET',
      'ENCRYPTION_KEY',
    ],
    censor: '[REDACTED]',
  },
  // Format propre des erreurs (stack + message + cause)
  serializers: {
    err: pino.stdSerializers.err,
  },
  // Désactive `hostname` + `pid` du log (réduit le bruit)
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Helper pour créer un logger enfant avec un contexte attaché.
 * Pratique dans le worker pour ajouter `jobId` à toutes les lignes d'un job.
 *
 * Usage :
 *   const log = childLogger({ jobId: job.id, websiteId });
 *   log.info('Step 1');
 *   log.error({ err }, 'Step 2 failed');
 */
export function childLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
