/**
 * Demo data for "Precision Garage Door Services — DEMO".
 *
 * The company is provisioned through the same `provisionOrganization` path a
 * real signup uses, then given history: repeat customers, doors with service
 * records, a truck that is low on one spring size, an unpaid invoice, and a day
 * that is half finished.
 *
 * This module only builds the data. Whether the database is wiped first is the
 * caller's decision, and the two callers decide differently: `prisma/seed.ts`
 * resets a development database, while `scripts/seed-demo.ts` and the
 * `/api/admin/seed-demo` endpoint add the demo company to a live deployment
 * alongside whatever else is already there, and refuse if it is already loaded.
 */
import { Prisma, type InspectionItemStatus, type SequenceEntity } from '@prisma/client'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { zoneOffsetMinutes } from '@/server/jobs/queries'
import { DEFAULT_PREFIX } from '@/lib/numbering'
import { provisionOrganization } from '@/server/organizations/provision'
import { recordAudit } from '@/lib/audit'
import { DEMO_CATALOG, DEMO_PRICE, DEMO_SERVICES } from './catalog'
import { RESIDENTIAL_INSPECTION, isValidResponse } from '@/lib/inspection-template'

/**
 * The application's own client, re-exported so the two standalone scripts can
 * disconnect it. A second client here would open a second pool inside the
 * running server for the one request that seeds the demo company.
 */
export { prisma }

export const DEMO_SLUG = 'precision-garage-door-demo'
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'GarageDoorHQ2026!'
export const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@garagedoorhq.test'

export const DEMO_OWNER_EMAIL = 'mike@precisiongaragedoor.test'
export const DEMO_TECH_EMAIL = 'tony@precisiongaragedoor.test'
/** The company's own contact address, not a login. */
export const DEMO_OFFICE_EMAIL = 'office@precisiongaragedoor.test'
export const DEMO_AFFILIATE_EMAIL = 'partner@gdocommunity.test'

/** Every account this seed creates, so a caller can check before it starts. */
export const DEMO_EMAILS = [DEMO_OWNER_EMAIL, DEMO_TECH_EMAIL, PLATFORM_ADMIN_EMAIL]

export interface DemoSummary {
  organization: string
  catalog: number
  packages: number
  remedies: number
  ownerEmail: string
  techEmail: string
  platformEmail: string
  password: string
}
const TZ = 'America/New_York'

/** Today at a given hour in the company's timezone, whatever the host's is. */
function todayAt(hour: number, minute = 0): Date {
  const now = new Date()
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number)

  const naive = Date.UTC(year!, month! - 1, day!, hour, minute, 0)
  return new Date(naive - zoneOffsetMinutes(new Date(naive), TZ) * 60_000)
}

function daysAgo(days: number, hour = 10): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date
}

function monthsAgo(months: number): Date {
  const date = new Date()
  date.setMonth(date.getMonth() - months)
  return date
}

/**
 * Wipe every table before seeding.
 *
 * Several relations are deliberately `onDelete: Restrict` so the application
 * can never destroy a catalog item a package references, or a customer who
 * still has jobs. Those guards are right for the product and inconvenient for
 * a seed, so the seed resets everything rather than working around them.
 */
export async function resetDatabase() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_RESET !== 'true') {
    throw new Error(
      'Refusing to reset a production database. Set ALLOW_SEED_RESET=true if that is really what you want.',
    )
  }

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `
  if (tables.length === 0) return

  const list = tables.map((row) => `"public"."${row.tablename}"`).join(', ')
  console.log(`  resetting ${tables.length} tables`)
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

/**
 * Give every seeded record the identifier its creation service would have.
 *
 * Uses the same prefixes as `nextIdentifier`, read from the organization's own
 * sequences so a seed that sets a custom prefix stays consistent with it.
 */
async function stampDisplayNumbers(organizationId: string) {
  const sequences = await prisma.numberSequence.findMany({ where: { organizationId } })
  const prefixFor = (entity: SequenceEntity) =>
    sequences.find((row) => row.entity === entity)?.prefix ?? DEFAULT_PREFIX[entity]

  const models = [
    ['customer', 'CUSTOMER'],
    ['door', 'DOOR'],
    ['job', 'JOB'],
    ['estimate', 'ESTIMATE'],
    ['invoice', 'INVOICE'],
  ] as const

  for (const [model, entity] of models) {
    const rows = await (prisma[model] as { findMany: (args: object) => Promise<Array<{ id: string; number: number }>> })
      .findMany({
        where: { organizationId, displayNumber: null },
        select: { id: true, number: true },
      })

    for (const row of rows) {
      await (prisma[model] as { update: (args: object) => Promise<unknown> }).update({
        where: { id: row.id },
        data: { displayNumber: `${prefixFor(entity)}${row.number}` },
      })
    }
  }
}

export async function seedDemoData(): Promise<DemoSummary> {
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  // --- People --------------------------------------------------------------
  const mike = await prisma.user.create({
    data: {
      email: DEMO_OWNER_EMAIL,
      passwordHash,
      firstName: 'Mike',
      lastName: 'Delgado',
      phone: '(555) 214-7788',
      emailVerifiedAt: monthsAgo(14),
    },
  })

  const tony = await prisma.user.create({
    data: {
      email: DEMO_TECH_EMAIL,
      passwordHash,
      firstName: 'Tony',
      lastName: 'Rivera',
      phone: '(555) 214-7790',
      emailVerifiedAt: monthsAgo(6),
    },
  })

  // Garage Door HQ staff — deliberately not an OWNER of any company.
  await prisma.user.create({
    data: {
      email: PLATFORM_ADMIN_EMAIL,
      passwordHash,
      firstName: 'Platform',
      lastName: 'Admin',
      platformRole: 'PLATFORM_ADMIN',
    },
  })

  // --- The company, provisioned exactly like a real signup -----------------
  const affiliate = await prisma.affiliate.create({
    data: {
      name: 'Garage Door Operators Community',
      email: DEMO_AFFILIATE_EMAIL,
      code: 'GDOC20',
      commissionPercent: 20,
      notes: 'Skool community partner — 20% recurring.',
    },
  })

  const { organization } = await provisionOrganization({
    ownerUserId: mike.id,
    name: 'Precision Garage Door Services — DEMO',
    slug: DEMO_SLUG,
    companySize: 'SMALL_2_5',
    catalog: DEMO_CATALOG,
    phone: '(555) 214-7788',
    postalCode: '28206',
    timezone: TZ,
    referralCode: affiliate.code,
    now: monthsAgo(14),
  })
  const orgId = organization.id

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      email: DEMO_OFFICE_EMAIL,
      website: 'https://precisiongaragedoor.test',
      addressLine1: '4120 Industrial Park Dr',
      city: 'Charlotte',
      state: 'NC',
      defaultTaxRateBps: 725,
      onboardingCompletedAt: monthsAgo(14),
      postalCode: '28206',
      defaultPaymentTermsDays: 15,
      // A company that has been running a while turned labor costing on.
      laborCostEnabled: true,
      laborCostPerHourCents: 4200,
      // Terms are copied onto each document at creation, so these apply to new
      // work only and never restate what a customer has already signed.
      estimateTermsText:
        'Prices are valid for 30 days. Springs and hardware carry a 5-year parts warranty; ' +
        'labor is warranted for 12 months. Work begins once this estimate is approved.',
      invoiceTermsText:
        'Payment is due within 15 days. We accept cash, check, and card. ' +
        'Thank you for your business.',
      reviewRequestEnabled: true,
    },
  })

  await prisma.reviewDestination.upsert({
    where: { organizationId_provider: { organizationId: orgId, provider: 'GOOGLE' } },
    update: {},
    create: {
      organizationId: orgId,
      provider: 'GOOGLE',
      url: 'https://g.page/r/precision-garage-door-demo/review',
      label: 'Google',
      isPrimary: true,
      isActive: true,
    },
  })

  await prisma.subscription.update({
    where: { organizationId: orgId },
    data: {
      status: 'ACTIVE',
      trialEndsAt: monthsAgo(13),
      currentPeriodStart: daysAgo(12),
      currentPeriodEnd: daysAgo(-18),
    },
  })

  // Readable numbers that look like a company with history.
  //
  // Each value must be strictly greater than the highest number this seed
  // hands out below, or the next record a user creates collides on
  // (organizationId, number).
  for (const [entity, value] of [
    ['JOB', 1044], // seeded jobs run to 1043
    ['ESTIMATE', 1023],
    ['INVOICE', 1009], // seeded invoices run to 1008
    ['DOOR', 2049], // seeded doors run to 2048
    ['CUSTOMER', 1033], // seeded customers run to 1032
  ] as const) {
    await prisma.numberSequence.update({
      where: { organizationId_entity: { organizationId: orgId, entity } },
      data: { nextValue: value },
    })
  }

  await prisma.reviewDestination.upsert({
    where: { organizationId_provider: { organizationId: orgId, provider: 'GOOGLE' } },
    update: {},
    create: {
      organizationId: orgId,
      provider: 'GOOGLE',
      label: 'Google',
      url: 'https://g.page/r/precision-garage-door/review',
      isPrimary: true,
    },
  })

  // These prices are the company's, not the starter catalog's suggestions, and
  // the product decides that from the audit trail — so the trail has to say so.
  // It also ticks "Set your own prices" on the setup checklist, which is true.
  for (const service of DEMO_SERVICES) {
    await recordAudit({
      organizationId: orgId,
      actorUserId: mike.id,
      action: 'pricebook.item_created',
      entityType: 'PriceBookItem',
      entityId: service.sku,
      after: { sku: service.sku, priceCents: service.priceCents, costCents: service.costCents },
    })
  }

  // --- Team and trucks -----------------------------------------------------
  const locations = await prisma.inventoryLocation.findMany({ where: { organizationId: orgId } })
  const warehouse = locations.find((location) => location.kind === 'WAREHOUSE')!
  const truck1 = locations.find((location) => location.name === 'Truck #1')!

  const truck2 = await prisma.inventoryLocation.create({
    data: { organizationId: orgId, name: 'Truck #2', kind: 'TRUCK', assignedUserId: tony.id },
  })

  await prisma.membership.create({
    data: {
      userId: tony.id,
      organizationId: orgId,
      role: 'TECHNICIAN',
      defaultLocationId: truck2.id,
    },
  })

  // --- Stock ---------------------------------------------------------------
  const catalog = await prisma.priceBookItem.findMany({ where: { organizationId: orgId } })
  const bySku = new Map(catalog.map((item) => [item.sku!, item]))
  const idOf = (sku: string) => bySku.get(sku)!.id

  /** Receive stock through the ledger so every quantity has a transaction behind it. */
  async function receive(locationId: string, sku: string, quantity: number, bin?: string) {
    const item = bySku.get(sku)
    if (!item) throw new Error(`Unknown SKU in seed: ${sku}`)

    await prisma.inventoryTransaction.create({
      data: {
        organizationId: orgId,
        priceBookItemId: item.id,
        kind: 'RECEIPT',
        toLocationId: locationId,
        quantity,
        unitCostCents: item.costCents,
        actorId: mike.id,
        reason: 'Opening count',
        createdAt: daysAgo(45),
      },
    })

    await prisma.stockLevel.upsert({
      where: { locationId_priceBookItemId: { locationId, priceBookItemId: item.id } },
      create: {
        organizationId: orgId,
        locationId,
        priceBookItemId: item.id,
        quantity,
        binLocation: bin ?? null,
      },
      update: { quantity: { increment: quantity }, binLocation: bin ?? undefined },
    })
  }

  const truck1Stock: Array<[string, number, string]> = [
    // Deliberately at the minimum: the Restock list has to have something real in it.
    ['TS-2250-200-270-L', 1, 'A1'],
    ['TS-2250-200-270-R', 1, 'A1'],
    ['TS-2250-200-270-L25', 2, 'A2'],
    ['TS-2250-200-270-R25', 2, 'A2'],
    ['TS-2500-200-320-L', 3, 'A3'],
    ['TS-2500-200-320-R', 3, 'A3'],
    ['TS-2070-175-240-L', 2, 'A4'],
    ['TS-2070-175-240-R', 2, 'A4'],
    ['ES-140-250-L', 4, 'B1'],
    ['ES-160-250-R', 4, 'B1'],
    ['RLR-NYL-13', 32, 'C1'],
    ['RLR-STL-10', 14, 'C1'],
    ['CBL-7FT-SET', 8, 'C2'],
    ['CBL-8FT-SET', 4, 'C2'],
    ['DRM-400-8', 8, 'C3'],
    ['BRG-625', 10, 'C3'],
    ['BRG-CTR', 4, 'C3'],
    ['HNG-NO2', 16, 'D1'],
    ['HNG-NO3', 12, 'D1'],
    ['RMT-STD', 11, 'E2'],
    ['KPD-STD', 5, 'E2'],
    ['WLC-STD', 3, 'E3'],
    ['SEAL-BTM-16', 15, 'F1'],
    ['SEAL-JMB-KIT', 9, 'F1'],
    ['LUB-KIT', 6, 'F2'],
  ]
  for (const [sku, quantity, bin] of truck1Stock) await receive(truck1.id, sku, quantity, bin)

  for (const [sku, quantity] of [
    ['TS-2250-200-270-L', 4],
    ['TS-2250-200-270-R', 4],
    ['RLR-NYL-13', 24],
    ['CBL-7FT-SET', 5],
  ] as Array<[string, number]>) {
    await receive(truck2.id, sku, quantity, 'A1')
  }

  for (const [sku, quantity] of [
    ['TS-2250-200-270-L', 14],
    ['TS-2250-200-270-R', 14],
    ['TS-2250-200-270-L25', 9],
    ['TS-2250-200-270-R25', 9],
    ['TS-2500-200-320-L', 11],
    ['TS-2500-200-320-R', 11],
    ['RLR-NYL-13', 180],
    ['SEAL-BTM-16', 40],
  ] as Array<[string, number]>) {
    await receive(warehouse.id, sku, quantity, 'R2')
  }

  // --- Customers, properties, doors ---------------------------------------
  const sarah = await prisma.customer.create({
    data: {
      organizationId: orgId,
      number: 1018,
      firstName: 'Sarah',
      lastName: 'Wilson',
      phone: '(555) 234-5678',
      email: 'sarah.wilson@example.test',
      customerSince: monthsAgo(26),
      createdAt: monthsAgo(26),
      tags: ['repeat'],
      properties: {
        create: {
          organizationId: orgId,
          nickname: 'Home',
          line1: '123 Maple Street',
          city: 'Charlotte',
          state: 'NC',
          postalCode: '28211',
          kind: 'RESIDENTIAL',
          accessInstructions: 'Driveway on the left. Dog is friendly but loud.',
        },
      },
    },
    include: { properties: true },
  })
  const sarahProperty = sarah.properties[0]!

  const sarahDoor = await prisma.door.create({
    data: {
      organizationId: orgId,
      propertyId: sarahProperty.id,
      number: 2043,
      nickname: 'Front Garage',
      widthInches: 192,
      heightInches: 84,
      panelCount: 4,
      manufacturer: 'Clopay',
      model: 'Premium Series 4050',
      serialNumber: 'CLP-4050-882314',
      operationType: 'SECTIONAL',
      material: 'STEEL',
      color: 'Almond',
      insulated: true,
      rValue: 6.5,
      trackType: '2" Standard Lift',
      trackRadiusInches: 15,
      headroomInches: 13,
      weightLbs: 178,
      installedAt: monthsAgo(39),
      warrantyEndsAt: monthsAgo(-81),
      createdAt: monthsAgo(26),
    },
  })

  await prisma.opener.create({
    data: {
      organizationId: orgId,
      doorId: sarahDoor.id,
      manufacturer: 'LiftMaster',
      model: '87504-267',
      serialNumber: 'LM87504-4471902',
      horsepower: '3/4 HP equivalent',
      driveType: 'BELT',
      voltage: '120V',
      batteryBackup: true,
      wifiEnabled: true,
      smartHome: 'myQ',
      remoteCount: 2,
      keypadInfo: 'Wireless keypad',
      installedAt: monthsAgo(18),
      warrantyEndsAt: monthsAgo(-30),
    },
  })

  // The 2-year-old 10K springs that are about to fail — today's broken spring job.
  await prisma.springSystem.create({
    data: {
      organizationId: orgId,
      doorId: sarahDoor.id,
      type: 'TORSION',
      shaftDiameter: '1"',
      drumModel: '400-8',
      doorWeightLbs: 178,
      manufacturer: 'Service Spring',
      installedAt: monthsAgo(24),
      springs: {
        create: [
          { wireSizeInches: 0.225, insideDiameterInches: 2, lengthInches: 27, wind: 'LEFT_HAND', quantity: 1, cycleRating: 10000, colorCode: 'Red' },
          { wireSizeInches: 0.225, insideDiameterInches: 2, lengthInches: 27, wind: 'RIGHT_HAND', quantity: 1, cycleRating: 10000, colorCode: 'Red' },
        ],
      },
    },
  })

  await prisma.doorEvent.createMany({
    data: [
      { doorId: sarahDoor.id, kind: 'INSTALLED', occurredAt: monthsAgo(39), title: 'Door Installed', detail: 'Clopay Premium Series 4050, 16x7 insulated steel.' },
      { doorId: sarahDoor.id, kind: 'SPRING_REPLACED', occurredAt: monthsAgo(24), title: 'Torsion Springs Replaced', detail: '.225 x 2" x 27" pair, 10,000 cycle.' },
      { doorId: sarahDoor.id, kind: 'OPENER_REPLACED', occurredAt: monthsAgo(18), title: 'Opener Replaced', detail: 'LiftMaster 87504-267 belt drive with battery backup.' },
      { doorId: sarahDoor.id, kind: 'TUNE_UP', occurredAt: monthsAgo(11), title: 'Annual Tune-Up', detail: 'Balanced, lubricated, safety reverse tested.' },
    ],
  })

  const david = await prisma.customer.create({
    data: {
      organizationId: orgId,
      number: 1026,
      firstName: 'David',
      lastName: 'Carter',
      phone: '(555) 902-3311',
      email: 'dcarter@example.test',
      customerSince: monthsAgo(8),
      createdAt: monthsAgo(8),
      properties: {
        create: {
          organizationId: orgId,
          nickname: 'Home',
          line1: '87 Ridgeline Ct',
          city: 'Matthews',
          state: 'NC',
          postalCode: '28105',
        },
      },
    },
    include: { properties: true },
  })
  const davidProperty = david.properties[0]!

  const davidDoor = await prisma.door.create({
    data: {
      organizationId: orgId,
      propertyId: davidProperty.id,
      number: 2044,
      nickname: 'Left Bay',
      widthInches: 108,
      heightInches: 84,
      panelCount: 4,
      manufacturer: 'Amarr',
      model: 'Stratford 3000',
      material: 'STEEL',
      color: 'White',
      insulated: false,
      trackType: '2" Standard Lift',
      weightLbs: 122,
      installedAt: monthsAgo(62),
    },
  })

  await prisma.springSystem.create({
    data: {
      organizationId: orgId,
      doorId: davidDoor.id,
      type: 'TORSION',
      shaftDiameter: '1"',
      drumModel: '400-8',
      doorWeightLbs: 122,
      installedAt: monthsAgo(62),
      springs: {
        create: [
          { wireSizeInches: 0.207, insideDiameterInches: 1.75, lengthInches: 24, wind: 'LEFT_HAND', quantity: 1, cycleRating: 10000, colorCode: 'Yellow' },
          { wireSizeInches: 0.207, insideDiameterInches: 1.75, lengthInches: 24, wind: 'RIGHT_HAND', quantity: 1, cycleRating: 10000, colorCode: 'Yellow' },
        ],
      },
    },
  })

  const mercer = await prisma.customer.create({
    data: {
      organizationId: orgId,
      number: 1029,
      firstName: 'Angela',
      lastName: 'Mercer',
      companyName: 'Mercer Logistics',
      phone: '(555) 771-4400',
      email: 'facilities@mercerlogistics.test',
      customerSince: monthsAgo(5),
      createdAt: monthsAgo(5),
      tags: ['commercial'],
      properties: {
        create: {
          organizationId: orgId,
          nickname: 'Warehouse',
          line1: '1900 Distribution Way',
          city: 'Concord',
          state: 'NC',
          postalCode: '28027',
          kind: 'COMMERCIAL',
          gateInfo: 'Gate code 4417, check in at the guard shack.',
        },
      },
    },
    include: { properties: true },
  })
  const mercerProperty = mercer.properties[0]!

  // Commercial buildings carry many numbered doors under one property.
  for (let bay = 1; bay <= 4; bay += 1) {
    await prisma.door.create({
      data: {
        organizationId: orgId,
        propertyId: mercerProperty.id,
        number: 2044 + bay,
        positionLabel: `Receiving Door ${bay}`,
        widthInches: 120,
        heightInches: 144,
        manufacturer: 'Wayne Dalton',
        model: '452',
        material: 'STEEL',
        insulated: true,
        trackType: 'Vertical Lift',
        installedAt: monthsAgo(70),
      },
    })
  }

  for (const [index, person] of [
    { first: 'Priya', last: 'Raman', phone: '(555) 388-2210', line1: '2201 Sharon Rd', city: 'Charlotte', zip: '28211' },
    { first: 'Bill', last: 'Okafor', phone: '(555) 660-1188', line1: '55 Foxcroft Ln', city: 'Pineville', zip: '28134' },
    { first: 'Janet', last: 'Holloway', phone: '(555) 419-7623', line1: '744 Old Mill Rd', city: 'Harrisburg', zip: '28075' },
  ].entries()) {
    await prisma.customer.create({
      data: {
        organizationId: orgId,
        number: 1030 + index,
        firstName: person.first,
        lastName: person.last,
        phone: person.phone,
        customerSince: monthsAgo(3 + index),
        createdAt: monthsAgo(3 + index),
        properties: {
          create: {
            organizationId: orgId,
            nickname: 'Home',
            line1: person.line1,
            city: person.city,
            state: 'NC',
            postalCode: person.zip,
          },
        },
      },
    })
  }

  // --- Today's board -------------------------------------------------------
  const jobTypes = await prisma.jobType.findMany({ where: { organizationId: orgId } })
  const jobType = (slug: string) => jobTypes.find((type) => type.slug === slug)!

  const completedA = await prisma.job.create({
    data: {
      organizationId: orgId,
      number: 1040,
      customerId: david.id,
      propertyId: davidProperty.id,
      doorId: davidDoor.id,
      jobTypeId: jobType('tune-up').id,
      assignedToId: mike.id,
      status: 'COMPLETED',
      reportedIssue: 'Annual maintenance, door has been noisy.',
      scheduledStart: todayAt(8, 0),
      scheduledEnd: todayAt(9, 0),
      startedAt: todayAt(8, 5),
      completedAt: todayAt(9, 10),
      revenueCents: 24900,
      partsCostCents: 3840,
      processingFeeCents: 750,
    },
  })

  const completedB = await prisma.job.create({
    data: {
      organizationId: orgId,
      number: 1041,
      customerId: mercer.id,
      propertyId: mercerProperty.id,
      jobTypeId: jobType('commercial-service').id,
      assignedToId: mike.id,
      status: 'COMPLETED',
      reportedIssue: 'Receiving Door 2 binding at the top section.',
      scheduledStart: todayAt(9, 30),
      scheduledEnd: todayAt(10, 0),
      startedAt: todayAt(9, 35),
      completedAt: todayAt(10, 5),
      revenueCents: 49800,
      partsCostCents: 9600,
      processingFeeCents: 1450,
    },
  })

  const brokenSpringJob = await prisma.job.create({
    data: {
      organizationId: orgId,
      number: 1043,
      customerId: sarah.id,
      propertyId: sarahProperty.id,
      doorId: sarahDoor.id,
      jobTypeId: jobType('broken-spring').id,
      assignedToId: mike.id,
      status: 'SCHEDULED',
      reportedIssue:
        "Heard a loud bang this morning and now the door won't open. Opener strains and stops.",
      scheduledStart: todayAt(10, 30),
      scheduledEnd: todayAt(12, 0),
    },
  })

  await prisma.job.create({
    data: {
      organizationId: orgId,
      number: 1042,
      customerId: david.id,
      propertyId: davidProperty.id,
      doorId: davidDoor.id,
      jobTypeId: jobType('remote-keypad').id,
      assignedToId: mike.id,
      status: 'SCHEDULED',
      reportedIssue: 'Keypad stopped responding after a battery change.',
      scheduledStart: todayAt(13, 0),
      scheduledEnd: todayAt(14, 0),
    },
  })

  await prisma.job.create({
    data: {
      organizationId: orgId,
      number: 1039,
      customerId: mercer.id,
      propertyId: mercerProperty.id,
      jobTypeId: jobType('preventive-maintenance').id,
      assignedToId: tony.id,
      status: 'SCHEDULED',
      reportedIssue: 'Quarterly PM on all four receiving doors.',
      scheduledStart: todayAt(14, 30),
      scheduledEnd: todayAt(17, 0),
    },
  })

  // --- Inspection already under way on the broken spring job ---------------
  //
  // Each answer is in the words its own component uses: the springs are Failed,
  // the balance test Passed, the lubrication is Needed. Checked below against
  // the template, so a mismatch stops the seed rather than seeding a sentence
  // no technician would say.
  const findings: Record<string, InspectionItemStatus> = {
    springs: 'FAILED',
    cables: 'GOOD',
    rollers: 'WORN',
    drums: 'GOOD',
    bearings: 'GOOD',
    tracks: 'GOOD',
    'bottom-seal': 'WORN',
    lubrication: 'NEEDED',
    'noise-vibration': 'NOTICEABLE',
    'door-balance': 'PASS',
    opener: 'PASS',
    'photo-eyes': 'PASS',
    'auto-reverse': 'PASS',
    'manual-release': 'PASS',
  }

  for (const [key, status] of Object.entries(findings)) {
    const component = RESIDENTIAL_INSPECTION.find((entry) => entry.key === key)
    if (!component) throw new Error(`Unknown inspection component in seed: ${key}`)
    if (!isValidResponse(component.responseType, status)) {
      throw new Error(`"${status}" is not an answer ${component.label} takes.`)
    }
  }

  await prisma.inspection.create({
    data: {
      organizationId: orgId,
      jobId: brokenSpringJob.id,
      doorId: sarahDoor.id,
      templateKey: 'residential-standard',
      status: 'IN_PROGRESS',
      items: {
        create: RESIDENTIAL_INSPECTION.map((component, index) => ({
          componentKey: component.key,
          label: component.label,
          responseType: component.responseType,
          sortOrder: index,
          status: findings[component.key] ?? 'NOT_CHECKED',
          note:
            component.key === 'springs'
              ? 'Left-hand spring broken approximately 6" from the winding cone.'
              : component.key === 'rollers'
                ? 'Original steel rollers, visible flat spots and play in the stems.'
                : null,
        })),
      },
    },
  })

  // --- The estimate the customer is looking at right now -------------------
  //
  // A company fourteen months in has estimates out. This one comes off the
  // inspection above: springs failed, rollers worn — which is exactly how the
  // product builds one, so the tiers and totals match what the app computes.
  /**
   * Document lines come from the menu rather than from numbers typed twice.
   * A price change in catalog.ts moves the estimate and the invoices with it.
   */
  function price(sku: string) {
    return DEMO_PRICE[sku]!.priceCents
  }

  function serviceLine(sku: string, sortOrder: number) {
    const service = DEMO_PRICE[sku]!
    return {
      kind: 'LABOR' as const,
      name: service.name,
      sku,
      quantity: 1,
      unitPriceCents: service.priceCents,
      unitCostCents: service.costCents,
      taxable: false,
      sortOrder,
    }
  }

  const springEstimate = await prisma.estimate.create({
    data: {
      organizationId: orgId,
      number: 1022,
      jobId: brokenSpringJob.id,
      customerId: sarah.id,
      title: 'Broken Spring',
      status: 'SENT',
      // Flat rate: the number quoted is the number paid. Nothing is added at
      // the bottom of the page.
      taxRateBps: 0,
      sentAt: todayAt(10, 40),
      expiresAt: daysAgo(-30),
      customerMessage:
        'Here are your options. Doing both springs is what we put on most homes this size — ' +
        'the second one is the same age as the one that broke.',
      termsText:
        'Prices valid for 30 days. Springs and hardware carry a 5-year parts warranty; labor is warranted for 12 months.',
      options: {
        create: [
          {
            tier: 'GOOD',
            name: DEMO_PRICE['FR-SPRING-1']!.name,
            description: 'Replace the broken spring, balance the door and test the safety reverse.',
            sortOrder: 0,
            subtotalCents: price('FR-SPRING-1'),
            taxCents: 0,
            totalCents: price('FR-SPRING-1'),
            items: { create: [serviceLine('FR-SPRING-1', 0)] },
          },
          {
            tier: 'BETTER',
            name: DEMO_PRICE['FR-SPRING-2']!.name,
            description:
              'Replace both springs as a matched pair, so the second one does not fail in a few months.',
            isRecommended: true,
            sortOrder: 1,
            subtotalCents: price('FR-SPRING-2'),
            taxCents: 0,
            totalCents: price('FR-SPRING-2'),
            items: { create: [serviceLine('FR-SPRING-2', 0)] },
          },
          {
            tier: 'BEST',
            name: 'Double Spring Change + Roller Swap & Tune-Up',
            description:
              'Both springs, new rollers and a full tune-up while the door is already apart.',
            sortOrder: 2,
            subtotalCents: price('FR-SPRING-2') + price('FR-ROLLER-TUNE'),
            taxCents: 0,
            totalCents: price('FR-SPRING-2') + price('FR-ROLLER-TUNE'),
            items: {
              create: [serviceLine('FR-SPRING-2', 0), serviceLine('FR-ROLLER-TUNE', 1)],
            },
          },
        ],
      },
    },
  })
  void springEstimate

  // --- Completed work: invoices, payments, parts and the ledger ------------
  const paidInvoice = await prisma.invoice.create({
    data: {
      organizationId: orgId,
      number: 1007,
      jobId: completedA.id,
      customerId: david.id,
      status: 'PAID',
      issuedAt: todayAt(9, 15),
      dueAt: todayAt(9, 15),
      paidAt: todayAt(9, 20),
      // One line, one number. The ten rollers that went into it come off the
      // truck through the ledger below, not off the customer's invoice.
      taxRateBps: 0,
      subtotalCents: price('FR-ROLLER-TUNE'),
      taxCents: 0,
      totalCents: price('FR-ROLLER-TUNE'),
      paidCents: price('FR-ROLLER-TUNE'),
      balanceCents: 0,
      items: { create: [serviceLine('FR-ROLLER-TUNE', 0)] },
    },
  })

  await prisma.payment.create({
    data: {
      organizationId: orgId,
      invoiceId: paidInvoice.id,
      customerId: david.id,
      method: 'CARD',
      status: 'SUCCEEDED',
      amountCents: price('FR-ROLLER-TUNE'),
      feeCents: 404,
      receivedAt: todayAt(9, 20),
      memo: 'Card taken on the technician phone.',
      cardBrand: 'visa',
      cardLast4: '4242',
    },
  })

  await prisma.invoice.create({
    data: {
      organizationId: orgId,
      number: 1008,
      jobId: completedB.id,
      customerId: mercer.id,
      status: 'SENT',
      issuedAt: todayAt(10, 15),
      dueAt: daysAgo(-30),
      // Two doors at the flat rate, plus bearings that are not on the menu and
      // are therefore sold as parts — which is why this one shows tax and the
      // residential invoice above does not.
      taxRateBps: 725,
      subtotalCents: 2 * price('FR-CABLES') + 4 * 2400,
      taxCents: 696,
      totalCents: 2 * price('FR-CABLES') + 4 * 2400 + 696,
      paidCents: 0,
      balanceCents: 2 * price('FR-CABLES') + 4 * 2400 + 696,
      notesToCustomer: 'Net 30 per the facilities agreement.',
      items: {
        create: [
          { ...serviceLine('FR-CABLES', 0), quantity: 2 },
          { kind: 'PART', name: 'End Bearing Plate 6252', sku: 'BRG-625', quantity: 4, unitPriceCents: 2400, unitCostCents: 650, taxable: true, sortOrder: 1 },
        ],
      },
    },
  })

  for (const used of [
    { sku: 'RLR-NYL-13', quantity: 10, jobId: completedA.id, at: todayAt(9, 10) },
    { sku: 'CBL-8FT-SET', quantity: 2, jobId: completedB.id, at: todayAt(10, 5) },
    { sku: 'BRG-625', quantity: 4, jobId: completedB.id, at: todayAt(10, 5) },
  ]) {
    const item = bySku.get(used.sku)!
    await prisma.jobPart.create({
      data: {
        jobId: used.jobId,
        priceBookItemId: item.id,
        description: item.name,
        sku: item.sku,
        quantity: new Prisma.Decimal(used.quantity),
        unitCostCents: item.costCents,
      },
    })
    await prisma.inventoryTransaction.create({
      data: {
        organizationId: orgId,
        priceBookItemId: item.id,
        kind: 'CONSUMPTION',
        fromLocationId: truck1.id,
        quantity: used.quantity,
        unitCostCents: item.costCents,
        jobId: used.jobId,
        actorId: mike.id,
        reason: 'Parts used on job',
        createdAt: used.at,
      },
    })
    await prisma.stockLevel.update({
      where: { locationId_priceBookItemId: { locationId: truck1.id, priceBookItemId: item.id } },
      data: { quantity: { decrement: used.quantity } },
    })
  }

  // A month of spring usage, so restocking advice has something to learn from.
  for (let week = 1; week <= 4; week += 1) {
    for (const sku of ['TS-2250-200-270-L', 'TS-2250-200-270-R']) {
      await prisma.inventoryTransaction.create({
        data: {
          organizationId: orgId,
          priceBookItemId: idOf(sku),
          kind: 'CONSUMPTION',
          fromLocationId: truck1.id,
          quantity: 1,
          actorId: mike.id,
          reason: 'Spring replacement',
          createdAt: daysAgo(week * 7),
        },
      })
    }
  }

  await prisma.note.create({
    data: {
      organizationId: orgId,
      jobId: brokenSpringJob.id,
      authorId: mike.id,
      body:
        'Customer mentioned the door has been getting slower for a few weeks. Original 10K springs are 2 years old — worth showing her the high-cycle option.',
    },
  })

  // The seed writes rows directly rather than going through the creation
  // services, so it has to hand out the identifiers a real signup would have
  // produced. Without this the demo company holds records with no stored
  // identifier — which is exactly the state display numbers exist to prevent,
  // since a later prefix change would appear to renumber them.
  await stampDisplayNumbers(orgId)

  const counts = {
    catalog: await prisma.priceBookItem.count({ where: { organizationId: orgId } }),
    packages: await prisma.priceBookPackage.count({ where: { organizationId: orgId } }),
    remedies: await prisma.inspectionRemedy.count({ where: { organizationId: orgId } }),
  }

  return {
    organization: organization.name,
    catalog: counts.catalog,
    packages: counts.packages,
    remedies: counts.remedies,
    ownerEmail: DEMO_OWNER_EMAIL,
    techEmail: DEMO_TECH_EMAIL,
    platformEmail: PLATFORM_ADMIN_EMAIL,
    password: DEMO_PASSWORD,
  }
}
