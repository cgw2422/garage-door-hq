'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { failure, parseForm, type FormState } from '@/lib/form'
import { createDoor } from '@/server/doors/service'

const optionalNumber = z.coerce.number().positive().optional()

const schema = z.object({
  propertyId: z.string().uuid(),
  nickname: z.string().max(80).optional(),
  positionLabel: z.string().max(80).optional(),
  widthInches: optionalNumber,
  heightInches: optionalNumber,
  panelCount: z.coerce.number().int().positive().max(12).optional(),
  manufacturer: z.string().max(80).optional(),
  model: z.string().max(120).optional(),
  serialNumber: z.string().max(120).optional(),
  material: z
    .enum(['STEEL', 'ALUMINUM', 'WOOD', 'WOOD_COMPOSITE', 'FIBERGLASS', 'VINYL', 'GLASS', 'ROLLING_STEEL', 'OTHER'])
    .optional(),
  color: z.string().max(60).optional(),
  insulated: z.enum(['yes', 'no', 'unknown']).optional(),
  trackType: z.string().max(80).optional(),
  weightLbs: optionalNumber,
  installedAt: z.string().optional(),
  notesSummary: z.string().max(2000).optional(),

  // Current spring configuration, if the technician measured it.
  'spring.wireSizeInches': optionalNumber,
  'spring.insideDiameterInches': optionalNumber,
  'spring.lengthInches': optionalNumber,
  'spring.quantity': z.coerce.number().int().min(1).max(8).optional(),
  'spring.cycleRating': z.coerce.number().int().positive().optional(),
  'spring.drumModel': z.string().max(60).optional(),
  'spring.shaftDiameter': z.string().max(40).optional(),

  'opener.manufacturer': z.string().max(80).optional(),
  'opener.model': z.string().max(120).optional(),
  'opener.serialNumber': z.string().max(120).optional(),
  'opener.driveType': z
    .enum(['BELT', 'CHAIN', 'SCREW', 'DIRECT_DRIVE', 'WALL_MOUNT', 'JACKSHAFT', 'TROLLEY', 'OTHER'])
    .optional(),
})

function parseDate(value?: string): Date | null {
  if (!value) return null
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function createDoorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission('door:write')
  const parsed = parseForm(schema, formData)
  if (!parsed.ok) return parsed.state

  const data = parsed.data
  const hasSprings =
    data['spring.wireSizeInches'] && data['spring.insideDiameterInches'] && data['spring.lengthInches']

  let doorId: string
  try {
    const door = await createDoor(session, data.propertyId, {
      nickname: data.nickname,
      positionLabel: data.positionLabel,
      widthInches: data.widthInches,
      heightInches: data.heightInches,
      panelCount: data.panelCount,
      manufacturer: data.manufacturer,
      model: data.model,
      serialNumber: data.serialNumber,
      material: data.material,
      color: data.color,
      insulated:
        data.insulated === 'yes' ? true : data.insulated === 'no' ? false : null,
      trackType: data.trackType,
      weightLbs: data.weightLbs,
      installedAt: parseDate(data.installedAt),
      notesSummary: data.notesSummary,
      opener: data['opener.manufacturer'] || data['opener.model']
        ? {
            manufacturer: data['opener.manufacturer'],
            model: data['opener.model'],
            serialNumber: data['opener.serialNumber'],
            driveType: data['opener.driveType'],
          }
        : undefined,
      springSystem: hasSprings
        ? {
            type: 'TORSION',
            drumModel: data['spring.drumModel'],
            shaftDiameter: data['spring.shaftDiameter'],
            doorWeightLbs: data.weightLbs,
            // A torsion door carries a mirrored pair, so recording one
            // measurement writes both hands unless the count says otherwise.
            springs: buildSpringPair({
              wireSizeInches: data['spring.wireSizeInches']!,
              insideDiameterInches: data['spring.insideDiameterInches']!,
              lengthInches: data['spring.lengthInches']!,
              quantity: data['spring.quantity'] ?? 2,
              cycleRating: data['spring.cycleRating'] ?? null,
            }),
          }
        : undefined,
    })
    doorId = door.id
  } catch (error) {
    return failure(error, formData)
  }

  redirect(`/doors/${doorId}`)
}

function buildSpringPair(input: {
  wireSizeInches: number
  insideDiameterInches: number
  lengthInches: number
  quantity: number
  cycleRating: number | null
}) {
  if (input.quantity === 2) {
    return [
      { ...input, quantity: 1, wind: 'LEFT_HAND' as const },
      { ...input, quantity: 1, wind: 'RIGHT_HAND' as const },
    ]
  }
  return [{ ...input, wind: null }]
}
