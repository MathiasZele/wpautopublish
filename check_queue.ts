import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import 'dotenv/config';

const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

async function checkQueue() {
  const queue = new Queue('article-generation', { connection });
  const counts = await queue.getJobCounts();
  console.log('Job Counts:', JSON.stringify(counts, null, 2));
  
  const waiting = await queue.getWaiting();
  console.log('Waiting Jobs (first 5):', JSON.stringify(waiting.map(j => ({ id: j.id, data: j.data })), null, 2));
  
  const failed = await queue.getFailed();
  console.log('Failed Jobs (first 5):', JSON.stringify(failed.map(j => ({ id: j.id, failedReason: j.failedReason })), null, 2));

  await connection.quit();
}

checkQueue().catch(console.error);
