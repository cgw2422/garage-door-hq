/**
 * Demo data for "Precision Garage Door Services — DEMO".
 *
 * The goal is a company that looks like it has been running for a while:
 * repeat customers, doors with history, a truck that is low on one spring size,
 * an unpaid invoice, and a day that is half finished. Nothing here is a
 * placeholder string — it is the kind of data a real shop would have.
 *
 * Safe to re-run: the script clears the demo organization first.
 */
import {
  PrismaClient,
  type PriceBookCategory,
  type WindDirection,
} from '@prisma/client'
import { hashPassword } from '../src/lib/password'
import { zoneOffsetMinutes } from '../src/server/jobs/queries'
import { EXTENSION_SPRINGS, JOB_TYPES, LABOR, PARTS, TORSION_SPRINGS } from './seed-data'

const prisma = new PrismaClient()

const DEMO_SLUG = 'precision-garage-door-demo'
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'GarageDoorHQ2026!'
const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@garagedoorhq.test'

/** The demo company's timezone. Seeded times are wall-clock times there. */
const TZ = 'America/New_York'

/**
 * Today at a given hour in the company's timezone, so the dashboard shows a
 * live day no matter what timezone the container or developer machine is in.
 */
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
 * A targeted delete of the demo organization is not enough: several relations
 * are deliberately `onDelete: Restrict` so the application can never destroy a
 * catalog item that a package references, or a customer that still has jobs.
 * Those guards are correct for the product and inconvenient for a seed, so the
 * seed resets the whole database instead of working around them.
 *
 * Refuses to run against production unless explicitly allowed.
 */
async function resetDatabase() {
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

async function main() {
  console.log('Seeding Garage Door HQ demo data…')

  await resetDatabase()

  const passwordHash = await hashPassword(DEMO_PASSWORD)

  // --- Organization -------------------------------------------------------
  const org = await prisma.organization.create({
    data: {
      name: 'Precision Garage Door Services — DEMO',
      slug: DEMO_SLUG,
      phone: '(555) 214-7788',
      email: 'office@precisiongaragedoor.test',
      website: 'https://precisiongaragedoor.test',
      addressLine1: '4120 Industrial Park Dr',
      city: 'Charlotte',
      state: 'NC',
      postalCode: '28206',
      timezone: 'America/New_York',
      defaultTaxRateBps: 725, // 7.25%
      companySize: 'SMALL_2_5',
      googleReviewUrl: 'https://g.page/r/precision-garage-door/review',
      laborCostPerHourCents: 4200,
      onboardingCompletedAt: monthsAgo(14),
      createdAt: monthsAgo(14),
      numberSequences: {
        create: [
          { entity: 'JOB', nextValue: 1044 },
          { entity: 'ESTIMATE', nextValue: 1023 },
          { entity: 'INVOICE', nextValue: 1009 },
          { entity: 'DOOR', nextValue: 2047 },
          { entity: 'CUSTOMER', nextValue: 1032 },
        ],
      },
      subscription: {
        create: {
          status: 'ACTIVE',
          planCode: 'standard-monthly',
          priceCents: 3999,
          currentPeriodStart: daysAgo(12),
          currentPeriodEnd: daysAgo(-18),
        },
      },
    },
  })

  // --- Team ---------------------------------------------------------------
  const mike = await prisma.user.create({
    data: {
      email: 'mike@precisiongaragedoor.test',
      passwordHash,
      firstName: 'Mike',
      lastName: 'Delgado',
      phone: '(555) 214-7788',
      emailVerifiedAt: monthsAgo(14),
      memberships: { create: { organizationId: org.id, role: 'OWNER' } },
    },
  })

  const tony = await prisma.user.create({
    data: {
      email: 'tony@precisiongaragedoor.test',
      passwordHash,
      firstName: 'Tony',
      lastName: 'Rivera',
      phone: '(555) 214-7790',
      emailVerifiedAt: monthsAgo(6),
      memberships: { create: { organizationId: org.id, role: 'TECHNICIAN' } },
    },
  })

  // A Garage Door HQ staff account, separate from any company's OWNER role.
  await prisma.user.upsert({
    where: { email: PLATFORM_ADMIN_EMAIL },
    update: { platformRole: 'PLATFORM_ADMIN' },
    create: {
      email: PLATFORM_ADMIN_EMAIL,
      passwordHash,
      firstName: 'Platform',
      lastName: 'Admin',
      platformRole: 'PLATFORM_ADMIN',
    },
  })

  // --- Job types ----------------------------------------------------------
  await prisma.jobType.createMany({
    data: JOB_TYPES.map((type, index) => ({
      organizationId: org.id,
      name: type.name,
      slug: type.slug,
      isSystem: true,
      sortOrder: index,
    })),
  })
  const jobTypes = await prisma.jobType.findMany({ where: { organizationId: org.id } })
  const jobType = (slug: string) => jobTypes.find((type) => type.slug === slug)!

  // --- Inventory locations -------------------------------------------------
  const warehouse = await prisma.inventoryLocation.create({
    data: { organizationId: org.id, name: 'Warehouse', kind: 'WAREHOUSE' },
  })
  const truck1 = await prisma.inventoryLocation.create({
    data: { organizationId: org.id, name: 'Truck #1', kind: 'TRUCK', assignedUserId: mike.id },
  })
  const truck2 = await prisma.inventoryLocation.create({
    data: { organizationId: org.id, name: 'Truck #2', kind: 'TRUCK', assignedUserId: tony.id },
  })

  await prisma.membership.update({
    where: { userId_organizationId: { userId: mike.id, organizationId: org.id } },
    data: { defaultLocationId: truck1.id },
  })
  await prisma.membership.update({
    where: { userId_organizationId: { userId: tony.id, organizationId: org.id } },
    data: { defaultLocationId: truck2.id },
  })

  // --- Price book ----------------------------------------------------------
  const springRows = [...TORSION_SPRINGS, ...EXTENSION_SPRINGS]
  const springItems = new Map<string, string>()

  for (const spring of springRows) {
    const item = await prisma.priceBookItem.create({
      data: {
        organizationId: org.id,
        category: 'SPRINGS',
        name: spring.name,
        sku: spring.sku,
        costCents: spring.costCents,
        priceCents: spring.priceCents,
        trackInventory: true,
        supplier: 'Service Spring Corp',
        springSpec: {
          create: {
            type: spring.sku.startsWith('ES-') ? 'EXTENSION' : 'TORSION',
            wireSizeInches: spring.wire,
            insideDiameterInches: spring.id,
            lengthInches: spring.length,
            wind: spring.wind as WindDirection,
            cycleRating: spring.cycles,
            colorCode: spring.colorCode,
          },
        },
      },
    })
    springItems.set(spring.sku, item.id)
  }

  const partItems = new Map<string, string>()
  for (const part of PARTS) {
    const item = await prisma.priceBookItem.create({
      data: {
        organizationId: org.id,
        category: part.category as PriceBookCategory,
        name: part.name,
        sku: part.sku,
        costCents: part.costCents,
        priceCents: part.priceCents,
        unit: part.unit,
        trackInventory: true,
      },
    })
    partItems.set(part.sku, item.id)
  }

  for (const labor of LABOR) {
    const item = await prisma.priceBookItem.create({
      data: {
        organizationId: org.id,
        category: labor.category as PriceBookCategory,
        name: labor.name,
        sku: labor.sku,
        costCents: labor.costCents,
        priceCents: labor.priceCents,
        taxable: labor.taxable,
        unit: 'ea',
        trackInventory: false,
      },
    })
    partItems.set(labor.sku, item.id)
  }

  // A package, because bundling is how a good shop sells a tune-up.
  await prisma.priceBookPackage.create({
    data: {
      organizationId: org.id,
      name: 'Premium Spring Package',
      description:
        'Two 25,000-cycle torsion springs, replacement labor, full safety inspection, lubrication and a 5-year warranty.',
      priceCents: 57900,
      items: {
        create: [
          { priceBookItemId: springItems.get('TS-2250-200-270-L25')!, quantity: 1 },
          { priceBookItemId: springItems.get('TS-2250-200-270-R25')!, quantity: 1 },
          { priceBookItemId: partItems.get('LBR-SPRING')!, quantity: 1 },
          { priceBookItemId: partItems.get('LBR-TUNEUP')!, quantity: 1 },
        ],
      },
    },
  })

  // --- Stock ---------------------------------------------------------------
  // Truck #1 mirrors the approved concept's inventory screen, including the
  // one spring size that is about to run out.
  const stock: Array<[string, string, number, number, string | null]> = [
    // [locationId, sku, quantity, minQuantity, bin]
    [truck1.id, 'TS-2250-200-270-L', 1, 2, 'A1'],
    [truck1.id, 'TS-2250-200-270-R', 1, 2, 'A1'],
    [truck1.id, 'TS-2250-200-270-L25', 2, 2, 'A2'],
    [truck1.id, 'TS-2250-200-270-R25', 2, 2, 'A2'],
    [truck1.id, 'TS-2500-200-320-L', 3, 2, 'A3'],
    [truck1.id, 'TS-2500-200-320-R', 3, 2, 'A3'],
    [truck1.id, 'TS-2070-175-240-L', 2, 1, 'A4'],
    [truck1.id, 'TS-2070-175-240-R', 2, 1, 'A4'],
    [truck1.id, 'ES-140-250-L', 4, 2, 'B1'],
    [truck1.id, 'ES-160-250-R', 4, 2, 'B1'],
    [truck1.id, 'RLR-NYL-13', 32, 20, 'C1'],
    [truck1.id, 'RLR-STL-10', 14, 10, 'C1'],
    [truck1.id, 'CBL-7FT-SET', 8, 4, 'C2'],
    [truck1.id, 'CBL-8FT-SET', 4, 2, 'C2'],
    [truck1.id, 'DRM-400-8', 8, 4, 'C3'],
    [truck1.id, 'BRG-625', 10, 6, 'C3'],
    [truck1.id, 'BRG-CTR', 4, 2, 'C3'],
    [truck1.id, 'HNG-NO2', 16, 10, 'D1'],
    [truck1.id, 'HNG-NO3', 12, 10, 'D1'],
    [truck1.id, 'OPN-LM-87504', 2, 1, 'E1'],
    [truck1.id, 'OPN-LM-8500W', 2, 1, 'E1'],
    [truck1.id, 'RMT-893MAX', 11, 6, 'E2'],
    [truck1.id, 'KPD-877MAX', 5, 3, 'E2'],
    [truck1.id, 'EYE-041A', 4, 2, 'E3'],
    [truck1.id, 'WLC-889LM', 3, 2, 'E3'],
    [truck1.id, 'SEAL-BTM-16', 15, 6, 'F1'],
    [truck1.id, 'SEAL-JMB-KIT', 9, 4, 'F1'],
    [truck2.id, 'TS-2250-200-270-L', 4, 2, 'A1'],
    [truck2.id, 'TS-2250-200-270-R', 4, 2, 'A1'],
    [truck2.id, 'RLR-NYL-13', 24, 20, 'C1'],
    [truck2.id, 'CBL-7FT-SET', 5, 4, 'C2'],
    [warehouse.id, 'TS-2250-200-270-L', 14, 8, 'R2-04'],
    [warehouse.id, 'TS-2250-200-270-R', 14, 8, 'R2-04'],
    [warehouse.id, 'TS-2250-200-270-L25', 9, 4, 'R2-05'],
    [warehouse.id, 'TS-2250-200-270-R25', 9, 4, 'R2-05'],
    [warehouse.id, 'TS-2500-200-320-L', 11, 6, 'R2-06'],
    [warehouse.id, 'TS-2500-200-320-R', 11, 6, 'R2-06'],
    [warehouse.id, 'RLR-NYL-13', 180, 100, 'R4-01'],
    [warehouse.id, 'OPN-LM-87504', 6, 3, 'R6-01'],
    [warehouse.id, 'SEAL-BTM-16', 40, 20, 'R7-02'],
  ]

  const lookup = (sku: string) => springItems.get(sku) ?? partItems.get(sku)!

  for (const [locationId, sku, quantity, minQuantity, bin] of stock) {
    await prisma.stockLevel.create({
      data: {
        organizationId: org.id,
        locationId,
        priceBookItemId: lookup(sku),
        quantity,
        minQuantity,
        binLocation: bin,
      },
    })
    // Opening balance, so the ledger explains every quantity on hand.
    await prisma.inventoryTransaction.create({
      data: {
        organizationId: org.id,
        priceBookItemId: lookup(sku),
        kind: 'RECEIPT',
        toLocationId: locationId,
        quantity,
        actorId: mike.id,
        reason: 'Opening count',
        createdAt: daysAgo(45),
      },
    })
  }

  // --- Customers, properties, doors ---------------------------------------
  const sarah = await prisma.customer.create({
    data: {
      organizationId: org.id,
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
          organizationId: org.id,
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
      organizationId: org.id,
      propertyId: sarahProperty.id,
      number: 2043,
      nickname: 'Front Garage',
      widthInches: 192, // 16'
      heightInches: 84, // 7'
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
      organizationId: org.id,
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
      keypadInfo: '877MAX wireless keypad',
      installedAt: monthsAgo(18),
      warrantyEndsAt: monthsAgo(-30),
    },
  })

  // The spring system that is about to fail — this is today's broken spring job.
  await prisma.springSystem.create({
    data: {
      organizationId: org.id,
      doorId: sarahDoor.id,
      type: 'TORSION',
      shaftDiameter: '1"',
      drumModel: '400-8',
      doorWeightLbs: 178,
      manufacturer: 'Service Spring',
      installedAt: monthsAgo(24),
      springs: {
        create: [
          {
            wireSizeInches: 0.225,
            insideDiameterInches: 2.0,
            lengthInches: 27,
            wind: 'LEFT_HAND',
            quantity: 1,
            cycleRating: 10000,
            colorCode: 'Red',
          },
          {
            wireSizeInches: 0.225,
            insideDiameterInches: 2.0,
            lengthInches: 27,
            wind: 'RIGHT_HAND',
            quantity: 1,
            cycleRating: 10000,
            colorCode: 'Red',
          },
        ],
      },
    },
  })

  await prisma.doorEvent.createMany({
    data: [
      {
        doorId: sarahDoor.id,
        kind: 'INSTALLED',
        occurredAt: monthsAgo(39),
        title: 'Door Installed',
        detail: 'Clopay Premium Series 4050, 16x7 insulated steel.',
      },
      {
        doorId: sarahDoor.id,
        kind: 'SPRING_REPLACED',
        occurredAt: monthsAgo(24),
        title: 'Torsion Springs Replaced',
        detail: '.225 x 2" x 27" pair, 10,000 cycle.',
      },
      {
        doorId: sarahDoor.id,
        kind: 'OPENER_REPLACED',
        occurredAt: monthsAgo(18),
        title: 'Opener Replaced',
        detail: 'LiftMaster 87504-267 belt drive with battery backup.',
      },
      {
        doorId: sarahDoor.id,
        kind: 'TUNE_UP',
        occurredAt: monthsAgo(11),
        title: 'Annual Tune-Up',
        detail: 'Balanced, lubricated, safety reverse tested.',
      },
    ],
  })

  const david = await prisma.customer.create({
    data: {
      organizationId: org.id,
      number: 1026,
      firstName: 'David',
      lastName: 'Carter',
      phone: '(555) 902-3311',
      email: 'dcarter@example.test',
      customerSince: monthsAgo(8),
      createdAt: monthsAgo(8),
      properties: {
        create: {
          organizationId: org.id,
          nickname: 'Home',
          line1: '87 Ridgeline Ct',
          city: 'Matthews',
          state: 'NC',
          postalCode: '28105',
          kind: 'RESIDENTIAL',
        },
      },
    },
    include: { properties: true },
  })
  const davidProperty = david.properties[0]!

  const davidDoor = await prisma.door.create({
    data: {
      organizationId: org.id,
      propertyId: davidProperty.id,
      number: 2044,
      nickname: 'Left Bay',
      widthInches: 108, // 9'
      heightInches: 84,
      panelCount: 4,
      manufacturer: 'Amarr',
      model: 'Stratford 3000',
      operationType: 'SECTIONAL',
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
      organizationId: org.id,
      doorId: davidDoor.id,
      type: 'TORSION',
      shaftDiameter: '1"',
      drumModel: '400-8',
      doorWeightLbs: 122,
      installedAt: monthsAgo(62),
      springs: {
        create: [
          {
            wireSizeInches: 0.207,
            insideDiameterInches: 1.75,
            lengthInches: 24,
            wind: 'LEFT_HAND',
            quantity: 1,
            cycleRating: 10000,
            colorCode: 'Yellow',
          },
          {
            wireSizeInches: 0.207,
            insideDiameterInches: 1.75,
            lengthInches: 24,
            wind: 'RIGHT_HAND',
            quantity: 1,
            cycleRating: 10000,
            colorCode: 'Yellow',
          },
        ],
      },
    },
  })

  const mercer = await prisma.customer.create({
    data: {
      organizationId: org.id,
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
          organizationId: org.id,
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
        organizationId: org.id,
        propertyId: mercerProperty.id,
        number: 2044 + bay,
        positionLabel: `Receiving Door ${bay}`,
        widthInches: 120,
        heightInches: 144,
        manufacturer: 'Wayne Dalton',
        model: '452',
        operationType: 'SECTIONAL',
        material: 'STEEL',
        insulated: true,
        trackType: 'Vertical Lift',
        installedAt: monthsAgo(70),
      },
    })
  }

  const others = [
    { first: 'Priya', last: 'Raman', phone: '(555) 388-2210', line1: '2201 Sharon Rd', city: 'Charlotte', zip: '28211' },
    { first: 'Bill', last: 'Okafor', phone: '(555) 660-1188', line1: '55 Foxcroft Ln', city: 'Pineville', zip: '28134' },
    { first: 'Janet', last: 'Holloway', phone: '(555) 419-7623', line1: '744 Old Mill Rd', city: 'Harrisburg', zip: '28075' },
  ]
  for (const [index, person] of others.entries()) {
    await prisma.customer.create({
      data: {
        organizationId: org.id,
        number: 1030 + index,
        firstName: person.first,
        lastName: person.last,
        phone: person.phone,
        customerSince: monthsAgo(3 + index),
        createdAt: monthsAgo(3 + index),
        properties: {
          create: {
            organizationId: org.id,
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
  // Two jobs already finished this morning, one in progress, two ahead.
  const completedA = await prisma.job.create({
    data: {
      organizationId: org.id,
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
      organizationId: org.id,
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
      organizationId: org.id,
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
      organizationId: org.id,
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
      organizationId: org.id,
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

  // --- Inspection on the broken spring job --------------------------------
  const { RESIDENTIAL_INSPECTION } = await import('../src/lib/inspection-template')
  const findings: Record<string, string> = {
    springs: 'FAILED',
    cables: 'GOOD',
    rollers: 'WORN',
    drums: 'GOOD',
    bearings: 'GOOD',
    tracks: 'GOOD',
    opener: 'GOOD',
    'bottom-seal': 'WORN',
    'photo-eyes': 'GOOD',
    'auto-reverse': 'NOT_APPLICABLE',
  }

  await prisma.inspection.create({
    data: {
      organizationId: org.id,
      jobId: brokenSpringJob.id,
      doorId: sarahDoor.id,
      templateKey: 'residential-standard',
      status: 'IN_PROGRESS',
      items: {
        create: RESIDENTIAL_INSPECTION.map((component, index) => ({
          componentKey: component.key,
          label: component.label,
          sortOrder: index,
          status: (findings[component.key] ?? 'NOT_CHECKED') as never,
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

  // --- Good / Better / Best estimate --------------------------------------
  const taxRateBps = org.defaultTaxRateBps

  const estimate = await prisma.estimate.create({
    data: {
      organizationId: org.id,
      number: 1022,
      jobId: brokenSpringJob.id,
      customerId: sarah.id,
      title: 'Spring Replacement',
      status: 'SENT',
      taxRateBps,
      sentAt: todayAt(11, 5),
      customerMessage:
        'Torsion spring replacement with options for higher cycle life and a full tune-up.',
      termsText:
        'Work is warranted for 12 months on labor. Spring warranty as stated per option.',
    },
  })

  async function addOption(input: {
    tier: 'GOOD' | 'BETTER' | 'BEST'
    name: string
    description: string
    recommended: boolean
    sortOrder: number
    lines: Array<{ sku: string; quantity: number; name?: string }>
  }) {
    const items = input.lines.map((line) => {
      const itemId = lookup(line.sku)
      const source = [...springRows].find((s) => s.sku === line.sku)
      const part = PARTS.find((p) => p.sku === line.sku)
      const labor = LABOR.find((l) => l.sku === line.sku)
      const priceCents = source?.priceCents ?? part?.priceCents ?? labor?.priceCents ?? 0
      const costCents = source?.costCents ?? part?.costCents ?? 0
      const taxable = labor ? labor.taxable : true
      return {
        priceBookItemId: itemId,
        kind: (labor
          ? line.sku === 'SVC-CALL'
            ? 'SERVICE_CALL'
            : 'LABOR'
          : 'PART') as never,
        name: line.name ?? source?.name ?? part?.name ?? labor?.name ?? line.sku,
        sku: line.sku,
        quantity: line.quantity,
        unitPriceCents: priceCents,
        unitCostCents: costCents,
        taxable,
      }
    })

    const subtotalCents = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0,
    )
    const taxableBase = items
      .filter((item) => item.taxable)
      .reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
    const taxCents = Math.round((taxableBase * taxRateBps) / 10_000)

    return prisma.estimateOption.create({
      data: {
        estimateId: estimate.id,
        tier: input.tier,
        name: input.name,
        description: input.description,
        isRecommended: input.recommended,
        sortOrder: input.sortOrder,
        subtotalCents,
        discountCents: 0,
        taxCents,
        totalCents: subtotalCents + taxCents,
        items: { create: items.map((item, index) => ({ ...item, sortOrder: index })) },
      },
    })
  }

  await addOption({
    tier: 'GOOD',
    name: 'Standard Spring Replacement',
    description: 'Matched pair of 10,000-cycle torsion springs and replacement labor.',
    recommended: false,
    sortOrder: 0,
    lines: [
      { sku: 'TS-2250-200-270-L', quantity: 1 },
      { sku: 'TS-2250-200-270-R', quantity: 1 },
      { sku: 'LBR-SPRING', quantity: 1 },
    ],
  })

  const better = await addOption({
    tier: 'BETTER',
    name: '25,000-Cycle Spring Replacement',
    description: 'High-cycle spring pair — roughly two and a half times the service life.',
    recommended: true,
    sortOrder: 1,
    lines: [
      { sku: 'TS-2250-200-270-L25', quantity: 1 },
      { sku: 'TS-2250-200-270-R25', quantity: 1 },
      { sku: 'LBR-SPRING', quantity: 1 },
    ],
  })

  await addOption({
    tier: 'BEST',
    name: 'High-Cycle Springs + Roller Upgrade',
    description:
      '25,000-cycle springs, ten 13-ball nylon rollers and a full safety tune-up with lubrication.',
    recommended: false,
    sortOrder: 2,
    lines: [
      { sku: 'TS-2250-200-270-L25', quantity: 1 },
      { sku: 'TS-2250-200-270-R25', quantity: 1 },
      { sku: 'RLR-NYL-13', quantity: 10 },
      { sku: 'LBR-SPRING', quantity: 1 },
      { sku: 'LBR-TUNEUP', quantity: 1 },
    ],
  })

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: { selectedOptionId: better.id },
  })

  // --- Invoices and payments ----------------------------------------------
  const paidInvoice = await prisma.invoice.create({
    data: {
      organizationId: org.id,
      number: 1007,
      jobId: completedA.id,
      customerId: david.id,
      status: 'PAID',
      issuedAt: todayAt(9, 15),
      dueAt: todayAt(9, 15),
      paidAt: todayAt(9, 20),
      taxRateBps,
      subtotalCents: 23200,
      taxCents: 1700,
      totalCents: 24900,
      paidCents: 24900,
      balanceCents: 0,
      items: {
        create: [
          {
            kind: 'SERVICE_CALL',
            name: 'Service Call',
            sku: 'SVC-CALL',
            quantity: 1,
            unitPriceCents: 8900,
            taxable: false,
            sortOrder: 0,
          },
          {
            kind: 'LABOR',
            name: 'Full Safety Tune-Up & Lubrication',
            sku: 'LBR-TUNEUP',
            quantity: 1,
            unitPriceCents: 8900,
            taxable: false,
            sortOrder: 1,
          },
          {
            kind: 'PART',
            name: '13-Ball Nylon Roller',
            sku: 'RLR-NYL-13',
            quantity: 10,
            unitPriceCents: 1200,
            unitCostCents: 320,
            taxable: true,
            sortOrder: 2,
          },
        ],
      },
    },
  })

  await prisma.payment.create({
    data: {
      organizationId: org.id,
      invoiceId: paidInvoice.id,
      customerId: david.id,
      method: 'CARD',
      status: 'SUCCEEDED',
      amountCents: 24900,
      feeCents: 750,
      receivedAt: todayAt(9, 20),
      memo: 'Tapped on the technician phone.',
      cardBrand: 'visa',
      cardLast4: '4242',
    },
  })

  await prisma.invoice.create({
    data: {
      organizationId: org.id,
      number: 1008,
      jobId: completedB.id,
      customerId: mercer.id,
      status: 'SENT',
      issuedAt: todayAt(10, 15),
      dueAt: daysAgo(-30),
      taxRateBps,
      subtotalCents: 46400,
      taxCents: 3400,
      totalCents: 49800,
      paidCents: 0,
      balanceCents: 49800,
      notesToCustomer: 'Net 30 per the facilities agreement.',
      items: {
        create: [
          {
            kind: 'SERVICE_CALL',
            name: 'Commercial Service Call',
            sku: 'SVC-CALL',
            quantity: 1,
            unitPriceCents: 8900,
            taxable: false,
            sortOrder: 0,
          },
          {
            kind: 'PART',
            name: 'Lift Cable Set · 8 ft Door',
            sku: 'CBL-8FT-SET',
            quantity: 2,
            unitPriceCents: 3800,
            unitCostCents: 1050,
            taxable: true,
            sortOrder: 1,
          },
          {
            kind: 'PART',
            name: 'End Bearing Plate 6252',
            sku: 'BRG-625',
            quantity: 4,
            unitPriceCents: 2400,
            unitCostCents: 650,
            taxable: true,
            sortOrder: 2,
          },
          {
            kind: 'LABOR',
            name: 'Cable Repair Labor',
            sku: 'LBR-CABLE',
            quantity: 2,
            unitPriceCents: 9900,
            taxable: false,
            sortOrder: 3,
          },
        ],
      },
    },
  })

  // --- Parts used + the ledger movement they caused ------------------------
  await prisma.jobPart.createMany({
    data: [
      {
        jobId: completedA.id,
        priceBookItemId: lookup('RLR-NYL-13'),
        description: '13-Ball Nylon Roller',
        sku: 'RLR-NYL-13',
        quantity: 10,
        unitCostCents: 320,
      },
      {
        jobId: completedB.id,
        priceBookItemId: lookup('CBL-8FT-SET'),
        description: 'Lift Cable Set · 8 ft Door',
        sku: 'CBL-8FT-SET',
        quantity: 2,
        unitCostCents: 1050,
      },
      {
        jobId: completedB.id,
        priceBookItemId: lookup('BRG-625'),
        description: 'End Bearing Plate 6252',
        sku: 'BRG-625',
        quantity: 4,
        unitCostCents: 650,
      },
    ],
  })

  for (const used of [
    { sku: 'RLR-NYL-13', quantity: 10, jobId: completedA.id, at: todayAt(9, 10) },
    { sku: 'CBL-8FT-SET', quantity: 2, jobId: completedB.id, at: todayAt(10, 5) },
    { sku: 'BRG-625', quantity: 4, jobId: completedB.id, at: todayAt(10, 5) },
  ]) {
    await prisma.inventoryTransaction.create({
      data: {
        organizationId: org.id,
        priceBookItemId: lookup(used.sku),
        kind: 'CONSUMPTION',
        fromLocationId: truck1.id,
        quantity: used.quantity,
        jobId: used.jobId,
        actorId: mike.id,
        reason: 'Parts used on job',
        createdAt: used.at,
      },
    })
    await prisma.stockLevel.update({
      where: {
        locationId_priceBookItemId: {
          locationId: truck1.id,
          priceBookItemId: lookup(used.sku),
        },
      },
      data: { quantity: { decrement: used.quantity } },
    })
  }

  // Historical spring usage, so "you used 7 in the last 30 days" has a basis.
  for (let week = 1; week <= 4; week += 1) {
    for (const sku of ['TS-2250-200-270-L', 'TS-2250-200-270-R']) {
      await prisma.inventoryTransaction.create({
        data: {
          organizationId: org.id,
          priceBookItemId: lookup(sku),
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

  // --- Affiliate attribution ----------------------------------------------
  const affiliate = await prisma.affiliate.create({
    data: {
      name: 'Garage Door Operators Community',
      email: 'partner@gdocommunity.test',
      code: 'GDOC20',
      commissionPercent: 20,
      notes: 'Skool community partner — 20% recurring.',
    },
  })

  await prisma.referral.create({
    data: {
      organizationId: org.id,
      affiliateId: affiliate.id,
      code: affiliate.code,
      landingUrl: 'https://garagedoorhq.test/?ref=GDOC20',
      attributedAt: monthsAgo(14),
    },
  })

  await prisma.note.create({
    data: {
      organizationId: org.id,
      jobId: brokenSpringJob.id,
      authorId: mike.id,
      body:
        'Customer mentioned the door has been getting slower for a few weeks. Original 10K springs are 2 years old — worth showing her the high-cycle option.',
    },
  })

  console.log(`
Demo data ready.

  Organization : ${org.name}
  Owner login  : mike@precisiongaragedoor.test
  Tech login   : tony@precisiongaragedoor.test
  Platform     : ${PLATFORM_ADMIN_EMAIL}
  Password     : ${DEMO_PASSWORD}
`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
