'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/session'
import { failure, parseForm, type FormState } from '@/lib/form'
import { createCustomer } from '@/server/customers/service'

const schema = z.object({
  firstName: z.string().min(1, 'First name is required').max(80),
  lastName: z.string().min(1, 'Last name is required').max(80),
  companyName: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  altPhone: z.string().max(40).optional(),
  email: z.string().email('Enter a valid email').max(160).optional(),
  notesSummary: z.string().max(2000).optional(),

  'property.nickname': z.string().max(80).optional(),
  'property.line1': z.string().max(200).optional(),
  'property.line2': z.string().max(120).optional(),
  'property.city': z.string().max(120).optional(),
  'property.state': z.string().max(2).optional(),
  'property.postalCode': z.string().max(16).optional(),
  'property.kind': z.enum(['RESIDENTIAL', 'COMMERCIAL']).optional(),
  'property.accessInstructions': z.string().max(500).optional(),
})

export async function createCustomerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission('customer:write')
  const parsed = parseForm(schema, formData)
  if (!parsed.ok) return parsed.state

  const data = parsed.data
  const hasAddress = Boolean(data['property.line1'])

  if (hasAddress && (!data['property.city'] || !data['property.state'] || !data['property.postalCode'])) {
    return {
      error: 'A service address needs a city, state and ZIP.',
      values: Object.fromEntries(
        [...formData.entries()].filter(([, v]) => typeof v === 'string') as [string, string][],
      ),
    }
  }

  let customerId: string
  let propertyId: string | null = null

  try {
    const result = await createCustomer(session, {
      firstName: data.firstName,
      lastName: data.lastName,
      companyName: data.companyName,
      phone: data.phone,
      altPhone: data.altPhone,
      email: data.email,
      notesSummary: data.notesSummary,
      property: hasAddress
        ? {
            nickname: data['property.nickname'],
            line1: data['property.line1']!,
            line2: data['property.line2'],
            city: data['property.city']!,
            state: data['property.state']!,
            postalCode: data['property.postalCode']!,
            kind: data['property.kind'],
            accessInstructions: data['property.accessInstructions'],
          }
        : undefined,
    })
    customerId = result.customer.id
    propertyId = result.property?.id ?? null
  } catch (error) {
    return failure(error, formData)
  }

  // Straight to adding the first door when an address exists: that is what the
  // technician is standing in front of.
  redirect(propertyId ? `/properties/${propertyId}/doors/new` : `/customers/${customerId}`)
}
