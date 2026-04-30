const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const numbers = await prisma.whatsAppAllowedNumber.findMany();
  console.log(JSON.stringify(numbers, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
