/** Fixed precision: 1 tablet/capsule/ml/other unit = 1,000 milliunits. */
export type Quantity = number & { readonly __quantity: unique symbol }
export const QUANTITY_SCALE = 1000

/** Parse user/backup decimal text exactly. Domain services enforce dose > 0. */
export function parseQuantity(value: string): Quantity {
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(value.trim())
  if (!match)
    throw new RangeError(
      'Use a decimal quantity with at most 3 decimal places.',
    )
  const magnitude =
    BigInt(match[2]) * 1000n + BigInt((match[3] ?? '').padEnd(3, '0'))
  const units = match[1] ? -magnitude : magnitude
  if (
    units > BigInt(Number.MAX_SAFE_INTEGER) ||
    units < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new RangeError('Quantity is outside the supported range.')
  }
  return Number(units) as Quantity
}

export function formatQuantity(value: Quantity): string {
  if (!Number.isSafeInteger(value))
    throw new RangeError('Quantity must be safe integer milliunits.')
  const units = BigInt(value)
  const absolute = units < 0 ? -units : units
  const fraction = (absolute % 1000n)
    .toString()
    .padStart(3, '0')
    .replace(/0+$/, '')
  return `${units < 0 ? '-' : ''}${absolute / 1000n}${fraction ? `.${fraction}` : ''}`
}
