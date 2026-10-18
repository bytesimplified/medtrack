import { describe, expect, it } from 'vitest'
import {
  formatQuantity,
  parseQuantity,
  type Quantity,
} from '../../src/database/quantity'
describe('fixed-precision quantities', () => {
  it.each([
    '0',
    '1',
    '0.5',
    '0.001',
    '30',
    '-1',
    '-0.125',
    '9007199254740.991',
  ])('round-trips %s exactly', (value) => {
    expect(formatQuantity(parseQuantity(value))).toBe(value)
  })
  it('represents decimal additions without floating-point drift', () => {
    expect(parseQuantity('0.1') + parseQuantity('0.2')).toBe(
      parseQuantity('0.3'),
    )
  })
  it.each(['', 'NaN', 'Infinity', '1e3', '1.0001', '9007199254740.992', '1,5'])(
    'rejects unsupported input %s',
    (value) => {
      expect(() => parseQuantity(value)).toThrow(RangeError)
    },
  )
  it('rejects corrupt stored precision', () => {
    expect(() => formatQuantity(0.1 as Quantity)).toThrow(RangeError)
  })
})
