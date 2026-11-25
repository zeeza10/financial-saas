import { CurrencyCodeSchema, type CurrencyCode, type MoneyDto } from '@financial-saas/contracts';

const ZERO_DECIMAL_CURRENCIES = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
}

export class DomainMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainMoneyError';
  }
}

export function getCurrencyDecimals(currency: CurrencyCode): number {
  CurrencyCodeSchema.parse(currency);
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(currency)) return 3;
  return 2;
}

/**
 * Construct an immutable Money value using integer minor units (BR-002).
 * Never accepts floating-point numbers.
 */
export function money(amountMinor: bigint | string, currency: CurrencyCode): Money {
  const validCurrency = CurrencyCodeSchema.parse(currency);
  if (typeof amountMinor === 'bigint') {
    return { amountMinor, currency: validCurrency };
  }
  if (typeof amountMinor === 'string' && /^-?(0|[1-9][0-9]*)$/.test(amountMinor)) {
    return { amountMinor: BigInt(amountMinor), currency: validCurrency };
  }
  throw new DomainMoneyError('BR-002: Money amount must be a bigint or canonical integer string');
}

export function fromMoneyDto(dto: MoneyDto): Money {
  return money(dto.amount_minor, dto.currency);
}

export function toMoneyDto(value: Money): MoneyDto {
  return {
    amount_minor: value.amountMinor.toString(),
    currency: value.currency,
  };
}

/**
 * Parses a decimal string (e.g. "123.45") into exact minor units without floats (BR-002).
 */
export function parseMajorUnits(decimalText: string, currency: CurrencyCode): Money {
  const decimals = getCurrencyDecimals(currency);
  const trimmed = decimalText.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    throw new DomainMoneyError(`BR-002: Invalid decimal amount "${decimalText}"`);
  }
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = match[2] ?? '0';
  const frac = match[3] ?? '';
  if (frac.length > decimals) {
    throw new DomainMoneyError(
      `BR-002: Too many decimal places (${frac.length}) for ${currency} (max ${decimals})`
    );
  }
  const paddedFrac = frac.padEnd(decimals, '0');
  const minor = BigInt(`${whole}${paddedFrac}`) * sign;
  return money(minor === 0n ? 0n : minor, currency);
}

/**
 * Formats minor units to an exact decimal string without floating-point rounding.
 */
export function formatMinorUnits(value: Money): string {
  const decimals = getCurrencyDecimals(value.currency);
  const sign = value.amountMinor < 0n ? '-' : '';
  const abs = value.amountMinor < 0n ? -value.amountMinor : value.amountMinor;
  if (decimals === 0) {
    return `${sign}${abs.toString()}`;
  }
  const str = abs.toString().padStart(decimals + 1, '0');
  const splitIdx = str.length - decimals;
  return `${sign}${str.slice(0, splitIdx)}.${str.slice(splitIdx)}`;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new DomainMoneyError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function negateMoney(a: Money): Money {
  return { amountMinor: a.amountMinor === 0n ? 0n : -a.amountMinor, currency: a.currency };
}

export function sumMoney(items: readonly Money[], currency: CurrencyCode): Money {
  let total = 0n;
  for (const item of items) {
    if (item.currency !== currency) {
      throw new DomainMoneyError(`Currency mismatch in sum: expected ${currency}, got ${item.currency}`);
    }
    total += item.amountMinor;
  }
  return money(total, currency);
}

/**
 * Allocates an amount across basis-point weights summing to 10_000 (100.00%)
 * using the largest-remainder method (BR-010, OQ-027, FT-14).
 * Tie-break: lowest index first (deterministic).
 */
export function allocateByBasisPoints(
  total: Money,
  weightsBps: readonly bigint[]
): readonly Money[] {
  if (weightsBps.length === 0) {
    throw new DomainMoneyError('BR-010: Allocation requires at least one recipient');
  }
  let weightSum = 0n;
  for (const w of weightsBps) {
    if (w < 0n) {
      throw new DomainMoneyError('BR-010: Allocation percentage cannot be negative');
    }
    weightSum += w;
  }
  if (weightSum !== 10_000n) {
    throw new DomainMoneyError(
      `BR-010: Allocation basis points must sum to 10000 (100.00%), got ${weightSum.toString()}`
    );
  }

  const sign = total.amountMinor < 0n ? -1n : 1n;
  const absTotal = total.amountMinor < 0n ? -total.amountMinor : total.amountMinor;

  const baseShares: bigint[] = [];
  const remainders: Array<{ index: number; remainder: bigint }> = [];
  let allocatedAbs = 0n;

  for (let i = 0; i < weightsBps.length; i++) {
    const w = weightsBps[i]!;
    const numerator = absTotal * w;
    const floorShare = numerator / 10_000n;
    const rem = numerator % 10_000n;
    baseShares.push(floorShare);
    remainders.push({ index: i, remainder: rem });
    allocatedAbs += floorShare;
  }

  let leftover = absTotal - allocatedAbs;
  remainders.sort((a, b) => {
    if (b.remainder > a.remainder) return 1;
    if (b.remainder < a.remainder) return -1;
    return a.index - b.index;
  });

  for (let i = 0; i < remainders.length && leftover > 0n; i++) {
    const idx = remainders[i]!.index;
    baseShares[idx] = (baseShares[idx] ?? 0n) + 1n;
    leftover -= 1n;
  }

  return baseShares.map((s) => {
    const signed = s === 0n ? 0n : s * sign;
    return { amountMinor: signed, currency: total.currency };
  });
}
