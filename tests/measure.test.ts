import { describe, expect, it } from 'vitest'
import { formatDoorSize, formatSpringSize, formatWireSize } from '@/lib/measure'

describe('spring and door measurements', () => {
  it('writes wire sizes the way a technician says them', () => {
    expect(formatWireSize(0.225)).toBe('.225')
    expect(formatWireSize(0.2)).toBe('.2')
    expect(formatWireSize('0.2437')).toBe('.2437')
  })

  it('formats a full spring size', () => {
    expect(formatSpringSize(0.225, 2, 27)).toBe('.225 x 2" x 27"')
    expect(formatSpringSize(0.207, 1.75, 24.5)).toBe('.207 x 1.75" x 24.5"')
  })

  it('formats door size in feet and inches', () => {
    expect(formatDoorSize(192, 84)).toBe("16' x 7'")
    expect(formatDoorSize(108, 90)).toBe("9' x 7'6\"")
  })
})
