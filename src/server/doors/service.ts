import {
  Prisma,
  type DoorEventKind,
  type DoorMaterial,
  type DoorOperationType,
  type OpenerDriveType,
  type SpringSystemType,
  type WindDirection,
} from '@prisma/client'
import { prisma } from '@/lib/db'
import { nextNumber } from '@/lib/numbering'
import { recordAudit } from '@/lib/audit'
import { formatSpringSize, formatWind } from '@/lib/measure'
import type { AppSession } from '@/lib/session'

/**
 * Door Passport writes.
 *
 * Every function that changes a door's physical configuration also writes a
 * `DoorEvent`, because a passport whose timeline can be out of step with its
 * current state is worse than no passport. The transaction-taking variants
 * exist so job completion can do all of this atomically.
 */

export interface SpringInput {
  wireSizeInches: number
  insideDiameterInches: number
  lengthInches: number
  wind?: WindDirection | null
  quantity: number
  cycleRating?: number | null
  colorCode?: string | null
  priceBookItemId?: string | null
}

export interface SpringSystemInput {
  type?: SpringSystemType
  shaftDiameter?: string | null
  drumModel?: string | null
  doorWeightLbs?: number | null
  manufacturer?: string | null
  installedAt?: Date | null
  warrantyEndsAt?: Date | null
  notesSummary?: string | null
  springs: SpringInput[]
}

export interface DoorInput {
  nickname?: string | null
  positionLabel?: string | null
  widthInches?: number | null
  heightInches?: number | null
  panelCount?: number | null
  manufacturer?: string | null
  model?: string | null
  serialNumber?: string | null
  operationType?: DoorOperationType
  style?: string | null
  panelStyle?: string | null
  material?: DoorMaterial | null
  color?: string | null
  windowStyle?: string | null
  insulated?: boolean | null
  trackType?: string | null
  trackRadiusInches?: number | null
  headroomInches?: number | null
  weightLbs?: number | null
  installedAt?: Date | null
  notesSummary?: string | null
}

export interface OpenerInput {
  manufacturer?: string | null
  model?: string | null
  serialNumber?: string | null
  horsepower?: string | null
  driveType?: OpenerDriveType | null
  batteryBackup?: boolean | null
  wifiEnabled?: boolean | null
  remoteCount?: number | null
  keypadInfo?: string | null
  installedAt?: Date | null
  warrantyEndsAt?: Date | null
  notesSummary?: string | null
}

export async function createDoor(
  session: AppSession,
  propertyId: string,
  input: DoorInput & { opener?: OpenerInput; springSystem?: SpringSystemInput },
) {
  const property = await session.db.property.findUnique({
    where: { id: propertyId },
    select: { id: true },
  })
  if (!property) throw new Error('Property not found')

  const door = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, session.organizationId, 'DOOR')

    const created = await tx.door.create({
      data: {
        organizationId: session.organizationId,
        propertyId,
        number,
        nickname: input.nickname?.trim() || null,
        positionLabel: input.positionLabel?.trim() || null,
        widthInches: input.widthInches ?? null,
        heightInches: input.heightInches ?? null,
        panelCount: input.panelCount ?? null,
        manufacturer: input.manufacturer?.trim() || null,
        model: input.model?.trim() || null,
        serialNumber: input.serialNumber?.trim() || null,
        operationType: input.operationType ?? 'SECTIONAL',
        style: input.style?.trim() || null,
        panelStyle: input.panelStyle?.trim() || null,
        material: input.material ?? null,
        color: input.color?.trim() || null,
        windowStyle: input.windowStyle?.trim() || null,
        insulated: input.insulated ?? null,
        trackType: input.trackType?.trim() || null,
        trackRadiusInches: input.trackRadiusInches ?? null,
        headroomInches: input.headroomInches ?? null,
        weightLbs: input.weightLbs ?? null,
        installedAt: input.installedAt ?? null,
        notesSummary: input.notesSummary?.trim() || null,
      },
    })

    if (input.installedAt) {
      await tx.doorEvent.create({
        data: {
          doorId: created.id,
          kind: 'INSTALLED',
          occurredAt: input.installedAt,
          title: 'Door Installed',
          detail: [input.manufacturer, input.model].filter(Boolean).join(' ') || null,
        },
      })
    }

    if (input.opener) {
      await tx.opener.create({
        data: {
          organizationId: session.organizationId,
          doorId: created.id,
          ...normalizeOpener(input.opener),
        },
      })
    }

    if (input.springSystem && input.springSystem.springs.length > 0) {
      await createSpringSystemTx(tx, {
        organizationId: session.organizationId,
        doorId: created.id,
        input: input.springSystem,
      })
    }

    return created
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'door.created',
    entityType: 'Door',
    entityId: door.id,
    after: { number: door.number, propertyId },
  })

  return door
}

function normalizeOpener(input: OpenerInput) {
  return {
    manufacturer: input.manufacturer?.trim() || null,
    model: input.model?.trim() || null,
    serialNumber: input.serialNumber?.trim() || null,
    horsepower: input.horsepower?.trim() || null,
    driveType: input.driveType ?? null,
    batteryBackup: input.batteryBackup ?? null,
    wifiEnabled: input.wifiEnabled ?? null,
    remoteCount: input.remoteCount ?? null,
    keypadInfo: input.keypadInfo?.trim() || null,
    installedAt: input.installedAt ?? null,
    warrantyEndsAt: input.warrantyEndsAt ?? null,
    notesSummary: input.notesSummary?.trim() || null,
  }
}

async function createSpringSystemTx(
  tx: Prisma.TransactionClient,
  params: { organizationId: string; doorId: string; input: SpringSystemInput },
) {
  return tx.springSystem.create({
    data: {
      organizationId: params.organizationId,
      doorId: params.doorId,
      type: params.input.type ?? 'TORSION',
      shaftDiameter: params.input.shaftDiameter?.trim() || null,
      drumModel: params.input.drumModel?.trim() || null,
      doorWeightLbs: params.input.doorWeightLbs ?? null,
      manufacturer: params.input.manufacturer?.trim() || null,
      installedAt: params.input.installedAt ?? null,
      warrantyEndsAt: params.input.warrantyEndsAt ?? null,
      notesSummary: params.input.notesSummary?.trim() || null,
      isCurrent: true,
      springs: {
        create: params.input.springs.map((spring) => ({
          wireSizeInches: spring.wireSizeInches,
          insideDiameterInches: spring.insideDiameterInches,
          lengthInches: spring.lengthInches,
          wind: spring.wind ?? null,
          quantity: spring.quantity,
          cycleRating: spring.cycleRating ?? null,
          colorCode: spring.colorCode?.trim() || null,
          priceBookItemId: spring.priceBookItemId ?? null,
        })),
      },
    },
    include: { springs: true },
  })
}

/** Human-readable summary of a spring configuration, for passport timelines. */
export function describeSprings(
  springs: Array<Pick<SpringInput, 'wireSizeInches' | 'insideDiameterInches' | 'lengthInches' | 'wind' | 'quantity' | 'cycleRating'>>,
): string {
  if (springs.length === 0) return 'No springs recorded'
  return springs
    .map((spring) => {
      const size = formatSpringSize(
        spring.wireSizeInches,
        spring.insideDiameterInches,
        spring.lengthInches,
      )
      const parts = [`${spring.quantity} × ${size}`]
      if (spring.wind) parts.push(formatWind(spring.wind))
      if (spring.cycleRating) parts.push(`${spring.cycleRating.toLocaleString('en-US')} cycle`)
      return parts.join(' · ')
    })
    .join('; ')
}

/**
 * Replace a door's spring system, preserving what was there before.
 *
 * The previous system is marked historical rather than edited, the new one
 * becomes current, and a single `SPRING_REPLACED` event records both sides of
 * the change so the timeline says what actually changed and when.
 *
 * Takes a transaction client because this is part of job completion.
 */
export async function replaceSpringSystemTx(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string
    doorId: string
    jobId?: string | null
    occurredAt: Date
    input: SpringSystemInput
  },
) {
  const previous = await tx.springSystem.findFirst({
    where: { organizationId: params.organizationId, doorId: params.doorId, isCurrent: true },
    include: { springs: true },
  })

  if (previous) {
    await tx.springSystem.update({
      where: { id: previous.id },
      data: { isCurrent: false, replacedAt: params.occurredAt },
    })
  }

  const created = await createSpringSystemTx(tx, {
    organizationId: params.organizationId,
    doorId: params.doorId,
    input: { ...params.input, installedAt: params.input.installedAt ?? params.occurredAt },
  })

  const before = previous
    ? describeSprings(
        previous.springs.map((spring) => ({
          wireSizeInches: Number(spring.wireSizeInches.toString()),
          insideDiameterInches: Number(spring.insideDiameterInches.toString()),
          lengthInches: Number(spring.lengthInches.toString()),
          wind: spring.wind,
          quantity: spring.quantity,
          cycleRating: spring.cycleRating,
        })),
      )
    : null
  const after = describeSprings(params.input.springs)

  await tx.doorEvent.create({
    data: {
      doorId: params.doorId,
      jobId: params.jobId ?? null,
      kind: 'SPRING_REPLACED',
      occurredAt: params.occurredAt,
      title: 'Torsion Springs Replaced',
      detail: before ? `${before}  →  ${after}` : after,
      metadata: { before, after, previousSpringSystemId: previous?.id ?? null } as Prisma.InputJsonValue,
    },
  })

  return { previous, current: created }
}

export async function replaceOpenerTx(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string
    doorId: string
    jobId?: string | null
    occurredAt: Date
    input: OpenerInput
  },
) {
  const previous = await tx.opener.findFirst({
    where: { organizationId: params.organizationId, doorId: params.doorId, isCurrent: true },
  })

  if (previous) {
    await tx.opener.update({
      where: { id: previous.id },
      data: { isCurrent: false, replacedAt: params.occurredAt },
    })
  }

  const created = await tx.opener.create({
    data: {
      organizationId: params.organizationId,
      doorId: params.doorId,
      ...normalizeOpener({ ...params.input, installedAt: params.input.installedAt ?? params.occurredAt }),
    },
  })

  const describe = (opener: { manufacturer: string | null; model: string | null } | null) =>
    opener ? [opener.manufacturer, opener.model].filter(Boolean).join(' ') || 'Unrecorded opener' : null

  await tx.doorEvent.create({
    data: {
      doorId: params.doorId,
      jobId: params.jobId ?? null,
      kind: 'OPENER_REPLACED',
      occurredAt: params.occurredAt,
      title: 'Opener Replaced',
      detail: previous
        ? `${describe(previous)}  →  ${describe(created)}`
        : describe(created),
      metadata: { before: describe(previous), after: describe(created) } as Prisma.InputJsonValue,
    },
  })

  return { previous, current: created }
}

export async function addDoorEventTx(
  tx: Prisma.TransactionClient,
  params: {
    doorId: string
    jobId?: string | null
    kind: DoorEventKind
    occurredAt: Date
    title: string
    detail?: string | null
    metadata?: Prisma.InputJsonValue
  },
) {
  return tx.doorEvent.create({
    data: {
      doorId: params.doorId,
      jobId: params.jobId ?? null,
      kind: params.kind,
      occurredAt: params.occurredAt,
      title: params.title,
      detail: params.detail ?? null,
      metadata: params.metadata,
    },
  })
}

/**
 * Correct a Door Passport's identifying and specification fields.
 *
 * Only the door's current description changes here. Spring systems, openers
 * and the event timeline are untouched: those are the record of what was done
 * and when, and a typo in a model number is not a reason to be able to rewrite
 * them. Replacing hardware goes through job completion, which writes history.
 */
export async function updateDoor(
  session: AppSession,
  doorId: string,
  input: DoorInput & { warrantyEndsAt?: Date | null; laborWarrantyEndsAt?: Date | null },
) {
  const before = await session.db.door.findUnique({ where: { id: doorId } })
  if (!before) throw new Error('Door not found')

  const door = await session.db.door.update({
    where: { id: doorId },
    data: {
      nickname: input.nickname?.trim() || null,
      positionLabel: input.positionLabel?.trim() || null,
      widthInches: input.widthInches ?? null,
      heightInches: input.heightInches ?? null,
      panelCount: input.panelCount ?? null,
      manufacturer: input.manufacturer?.trim() || null,
      model: input.model?.trim() || null,
      serialNumber: input.serialNumber?.trim() || null,
      operationType: input.operationType ?? before.operationType,
      material: input.material ?? null,
      color: input.color?.trim() || null,
      windowStyle: input.windowStyle?.trim() || null,
      insulated: input.insulated ?? null,
      trackType: input.trackType?.trim() || null,
      trackRadiusInches: input.trackRadiusInches ?? null,
      headroomInches: input.headroomInches ?? null,
      weightLbs: input.weightLbs ?? null,
      installedAt: input.installedAt ?? null,
      warrantyEndsAt: input.warrantyEndsAt ?? null,
      laborWarrantyEndsAt: input.laborWarrantyEndsAt ?? null,
      notesSummary: input.notesSummary?.trim() || null,
    },
  })

  await recordAudit({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    action: 'door.updated',
    entityType: 'Door',
    entityId: doorId,
    before: {
      manufacturer: before.manufacturer,
      model: before.model,
      serialNumber: before.serialNumber,
    },
    after: {
      manufacturer: door.manufacturer,
      model: door.model,
      serialNumber: door.serialNumber,
    },
  })

  return door
}

export async function archiveDoor(session: AppSession, doorId: string) {
  const openJobs = await session.db.job.count({
    where: { doorId, archivedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
  })
  if (openJobs > 0) {
    throw new Error('This door has open jobs. Finish or cancel them first.')
  }

  return session.db.door.update({
    where: { id: doorId },
    data: { archivedAt: new Date() },
  })
}
