import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.articleLog.count();
  console.log('ArticleLog count:', count);
  
  const websites = await prisma.website.findMany();
  console.log('Websites in DB:', websites.length);
  for (const w of websites) {
      console.log(`- Site ID: ${w.id}, URL: ${w.url}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
