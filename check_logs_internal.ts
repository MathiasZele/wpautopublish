import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.articleLog.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
  });
  console.log('--- LOGS START ---');
  console.log(JSON.stringify(logs, null, 2));
  console.log('--- LOGS END ---');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
