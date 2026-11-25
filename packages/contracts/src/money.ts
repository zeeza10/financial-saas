import { z } from 'zod';

/**
 * ISO 4217 3-letter uppercase currency code (BR-002).
 */
export const CurrencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter uppercase ISO 4217 code');

export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

/**
 * Signed integer minor units serialized as a decimal string to preserve
 * arbitrary precision beyond Number.MAX_SAFE_INTEGER (BR-002, FT-32).
 */
export const AmountMinorStringSchema = z
  .string()
  .regex(/^-?(0|[1-9][0-9]*)$/, 'amount_minor must be a canonical integer string');

/**
 * Strictly positive integer minor units (> 0) as required for journal lines (BR-001).
 */
export const PositiveAmountMinorStringSchema = z
  .string()
  .regex(/^[1-9][0-9]*$/, 'amount_minor must be a positive integer string');

export const MoneySchema = z
  .object({
    amount_minor: AmountMinorStringSchema,
    currency: CurrencyCodeSchema,
  })
  .strict();

export type MoneyDto = z.infer<typeof MoneySchema>;
