'use client'

import { Field, Input, Select } from '@/components/ui/field'

/**
 * One service address. Shared by customer creation, property creation and
 * property editing so the shape of an address is defined once.
 */
export function AddressFields({
  prefix = '',
  values,
  fieldErrors,
  required = true,
}: {
  /** Namespace for the input names, e.g. "property." when nested in a customer form. */
  prefix?: string
  values?: Record<string, string>
  fieldErrors?: Record<string, string>
  required?: boolean
}) {
  const name = (key: string) => `${prefix}${key}`
  const value = (key: string) => values?.[name(key)]
  const error = (key: string) => fieldErrors?.[name(key)]

  return (
    <>
      <Field label="Nickname" hint="Home, Rental, Main Shop…" error={error('nickname')}>
        <Input name={name('nickname')} placeholder="Home" defaultValue={value('nickname')} />
      </Field>

      <Field label="Street address" error={error('line1')}>
        <Input
          name={name('line1')}
          autoComplete="address-line1"
          required={required}
          placeholder="123 Maple Street"
          defaultValue={value('line1')}
        />
      </Field>

      <Field label="Unit / suite" error={error('line2')}>
        <Input name={name('line2')} autoComplete="address-line2" defaultValue={value('line2')} />
      </Field>

      <div className="grid grid-cols-[1fr_5rem] gap-3">
        <Field label="City" error={error('city')}>
          <Input
            name={name('city')}
            autoComplete="address-level2"
            required={required}
            defaultValue={value('city')}
          />
        </Field>
        <Field label="State" error={error('state')}>
          <Input
            name={name('state')}
            autoComplete="address-level1"
            required={required}
            maxLength={2}
            placeholder="NC"
            className="uppercase"
            defaultValue={value('state')}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ZIP" error={error('postalCode')}>
          <Input
            name={name('postalCode')}
            inputMode="numeric"
            autoComplete="postal-code"
            required={required}
            defaultValue={value('postalCode')}
          />
        </Field>
        <Field label="Type">
          <Select name={name('kind')} defaultValue={value('kind') ?? 'RESIDENTIAL'}>
            <option value="RESIDENTIAL">Residential</option>
            <option value="COMMERCIAL">Commercial</option>
          </Select>
        </Field>
      </div>

      <Field label="Access instructions" error={error('accessInstructions')}>
        <Input
          name={name('accessInstructions')}
          placeholder="Gate code, dog, park in the driveway…"
          defaultValue={value('accessInstructions')}
        />
      </Field>
    </>
  )
}
