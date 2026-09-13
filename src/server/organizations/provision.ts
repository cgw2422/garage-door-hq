import { Prisma, type CompanySize } from '@prisma/client'
import { prisma } from '@/lib/db'
import { STARTER_CATALOG, STARTER_JOB_TYPES, type Catalog } from './starter-catalog'

/**
 * Everything a brand-new garage door company needs to be useful on day one:
 * numbering sequences, the owner's membership, an inventory location they never
 * have to choose, garage-door job types, a starter price book, reusable
 * estimate packages and the inspection-to-estimate remedy mapping.
 *
 * All of it in one transaction. A half-provisioned account is worse than a
 * failed signup, because the owner cannot tell what is missing.
 */

export const DEFAULT_TRIAL_DAYS = 14

export function trialDays(): number {
  const configured = Number(process.env.TRIAL_DAYS)
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_TRIAL_DAYS
}

export async function slugify(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'company'

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const taken = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!taken) return candidate
  }
  return `${base}-${Date.now()}`
}

export interface ProvisionInput {
  ownerUserId: string
  name: string
  slug: string
  companySize: CompanySize
  phone?: string | null
  postalCode?: string | null
  timezone?: string
  /** Affiliate code captured on the landing page, attributed once and never rewritten. */
  referralCode?: string | null
  /** Skip the suggested catalog for a company importing their own. */
  includeStarterCatalog?: boolean
  /** A different catalog entirely — the demo company prices flat rate. */
  catalog?: Catalog
  now?: Date
}

export async function provisionOrganization(input: ProvisionInput) {
  const now = input.now ?? new Date()
  const trialEndsAt = new Date(now.getTime() + trialDays() * 24 * 60 * 60 * 1000)
  const isSolo = input.companySize === 'SOLO'

  const affiliate = input.referralCode
    ? await prisma.affiliate.findUnique({
        where: { code: input.referralCode.trim().toUpperCase() },
        select: { id: true, code: true, isActive: true },
      })
    : null

  return prisma.$transaction(
    async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: input.name.trim(),
          slug: input.slug,
          phone: input.phone?.trim() || null,
          postalCode: input.postalCode?.trim() || null,
          companySize: input.companySize,
          timezone: input.timezone ?? 'America/New_York',
          createdAt: now,
          numberSequences: {
            create: [
              { entity: 'JOB', nextValue: 1000 },
              { entity: 'ESTIMATE', nextValue: 1000 },
              { entity: 'INVOICE', nextValue: 1000 },
              { entity: 'DOOR', nextValue: 2000 },
              { entity: 'CUSTOMER', nextValue: 1000 },
            ],
          },
          subscription: {
            create: {
              status: 'TRIALING',
              planCode: 'standard-monthly',
              priceCents: 3999,
              trialEndsAt,
            },
          },
        },
      })

      // A solo operator gets one location called "My Truck" and is never asked
      // to pick it. A team gets a warehouse and a first truck.
      const locations = isSolo
        ? [{ name: 'My Truck', kind: 'TRUCK' as const, assign: true }]
        : [
            { name: 'Warehouse', kind: 'WAREHOUSE' as const, assign: false },
            { name: 'Truck #1', kind: 'TRUCK' as const, assign: true },
          ]

      let defaultLocationId: string | null = null
      for (const location of locations) {
        const created = await tx.inventoryLocation.create({
          data: {
            organizationId: organization.id,
            name: location.name,
            kind: location.kind,
            assignedUserId: location.assign ? input.ownerUserId : null,
          },
        })
        if (location.assign) defaultLocationId = created.id
      }

      await tx.membership.create({
        data: {
          userId: input.ownerUserId,
          organizationId: organization.id,
          role: 'OWNER',
          defaultLocationId,
        },
      })

      await tx.jobType.createMany({
        data: STARTER_JOB_TYPES.map((type, index) => ({
          organizationId: organization.id,
          name: type.name,
          slug: type.slug,
          isSystem: true,
          sortOrder: index,
        })),
      })

      if (input.includeStarterCatalog !== false) {
        await seedStarterCatalog(tx, organization.id, defaultLocationId, input.catalog)
      }

      if (affiliate?.isActive) {
        await tx.referral.create({
          data: {
            organizationId: organization.id,
            affiliateId: affiliate.id,
            code: affiliate.code,
            attributedAt: now,
          },
        })
      }

      return { organization, defaultLocationId, trialEndsAt }
    },
    // Provisioning writes a few hundred rows; the default 5s is too tight.
    { timeout: 30_000 },
  )
}

/**
 * Suggested catalog, packages and remedies. Exported so the demo seed builds
 * its company exactly the way a real signup does.
 */
export async function seedStarterCatalog(
  tx: Prisma.TransactionClient,
  organizationId: string,
  stockLocationId: string | null,
  catalog: Catalog = STARTER_CATALOG,
) {
  const idBySku = new Map<string, string>()

  for (const spring of catalog.springs) {
    const item = await tx.priceBookItem.create({
      data: {
        organizationId,
        category: 'SPRINGS',
        name: spring.name,
        sku: spring.sku,
        costCents: spring.costCents,
        priceCents: spring.priceCents,
        trackInventory: true,
        springSpec: {
          create: {
            type: spring.type,
            wireSizeInches: spring.wire,
            insideDiameterInches: spring.insideDiameter,
            lengthInches: spring.length,
            wind: spring.wind,
            cycleRating: spring.cycles,
            colorCode: spring.colorCode,
          },
        },
      },
    })
    idBySku.set(spring.sku, item.id)

    if (stockLocationId) {
      await tx.stockLevel.create({
        data: {
          organizationId,
          locationId: stockLocationId,
          priceBookItemId: item.id,
          // A new account starts with nothing on the truck. Minimums are set so
          // the restock list is useful as soon as they do a physical count.
          quantity: 0,
          minQuantity: spring.truckMin,
        },
      })
    }
  }

  for (const part of catalog.parts) {
    const item = await tx.priceBookItem.create({
      data: {
        organizationId,
        category: part.category,
        name: part.name,
        sku: part.sku,
        costCents: part.costCents,
        priceCents: part.priceCents,
        unit: part.unit,
        taxable: part.taxable ?? true,
        trackInventory: part.trackInventory ?? true,
      },
    })
    idBySku.set(part.sku, item.id)

    if (stockLocationId && (part.trackInventory ?? true)) {
      await tx.stockLevel.create({
        data: {
          organizationId,
          locationId: stockLocationId,
          priceBookItemId: item.id,
          quantity: 0,
          minQuantity: part.truckMin ?? 0,
        },
      })
    }
  }

  const packageIdByKey = new Map<string, string>()
  for (const pkg of catalog.packages) {
    const created = await tx.priceBookPackage.create({
      data: {
        organizationId,
        name: pkg.name,
        description: pkg.description,
        defaultTier: pkg.defaultTier,
        isRecommendedDefault: pkg.isRecommendedDefault,
        sortOrder: pkg.sortOrder,
        items: {
          create: pkg.lines
            .filter((line) => idBySku.has(line.sku))
            .map((line) => ({
              priceBookItemId: idBySku.get(line.sku)!,
              quantity: line.quantity,
            })),
        },
      },
    })
    packageIdByKey.set(pkg.key, created.id)
  }

  for (const remedy of catalog.remedies) {
    const packageId = remedy.packageKey ? packageIdByKey.get(remedy.packageKey) : undefined
    const priceBookItemId = remedy.sku ? idBySku.get(remedy.sku) : undefined
    if (!packageId && !priceBookItemId) continue

    await tx.inspectionRemedy.create({
      data: {
        organizationId,
        componentKey: remedy.componentKey,
        name: remedy.name,
        description: remedy.description ?? null,
        packageId: packageId ?? null,
        priceBookItemId: packageId ? null : (priceBookItemId ?? null),
        quantity: remedy.quantity ?? 1,
        forStatuses: remedy.forStatuses ?? [],
        sortOrder: remedy.sortOrder ?? 0,
      },
    })
  }

  return { idBySku, packageIdByKey }
}
