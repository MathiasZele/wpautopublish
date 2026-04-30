import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export interface ArticleJobData {
  websiteId: string;
  mode: 'AUTO' | 'MANUAL';
  manualInput?: string;
  manualImageUrl?: string;
  title?: string;
  content?: string;
  articleIndex?: number;
  categoryIds?: number[];
  autoCategorize?: boolean;
  whatsAppRequestId?: string;
  provider?: string;
}

const globalForQueue = globalThis as unknown as {
  articleQueue: Queue<ArticleJobData> | undefined;
  redisConnection: IORedis | undefined;
};

function getRedis(): IORedis {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is not configured');
  if (!globalForQueue.redisConnection) {
    globalForQueue.redisConnection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return globalForQueue.redisConnection;
}

export function getArticleQueue(): Queue<ArticleJobData> {
  if (!globalForQueue.articleQueue) {
    globalForQueue.articleQueue = new Queue<ArticleJobData>('article-generation', {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    });
  }
  return globalForQueue.articleQueue;
}
