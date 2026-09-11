import { PrismaClient } from '@prisma/client'

/**
 * Tests share one Postgres schema and build their own organizations. Wiping
 * once before the run keeps them independent of whatever was seeded locally,
 * without each file having to unpick the schema's deliberate `Restrict`
 * relations.
 */
export default async function globalSetup() {
  const prisma = new PrismaClient()
  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    `
    if (tables.length > 0) {
      const list = tables.map((row) => `"public"."${row.tablename}"`).join(', ')
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
    }
  } finally {
    await prisma.$disconnect()
  }
}
