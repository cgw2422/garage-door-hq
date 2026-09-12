'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireActiveSubscription } from '@/lib/session'
import { failure, parseForm, type FormState, guarded } from '@/lib/form'
import { createProperty } from '@/server/customers/service'

const schema = z.object({
  customerId: z.string().uuid(),
  nickname: z.string().max(80).optional(),
  line1: z.string().min(1, 'Street address is required').max(200),
  line2: z.string().max(120).optional(),
  city: z.string().min(1, 'City is required').max(120),
  state: z.string().min(2, 'State is required').max(2),
  postalCode: z.string().min(3, 'ZIP is required').max(16),
  kind: z.enum(['RESIDENTIAL', 'COMMERCIAL']).optional(),
  accessInstructions: z.string().max(500).optional(),
})

export async function createPropertyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const gate = await guarded(() => requireActiveSubscription('customer:write'), formData)
  if (!gate.ok) return gate.state
  const session = gate.value
  const parsed = parseForm(schema, formData)
  if (!parsed.ok) return parsed.state

  let propertyId: string
  try {
    const { customerId, ...rest } = parsed.data
    const property = await createProperty(session, customerId, rest)
    propertyId = property.id
  } catch (error) {
    return failure(error, formData)
  }

  redirect(`/properties/${propertyId}/doors/new`)
}
