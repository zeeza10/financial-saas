import { z } from 'zod';

/**
 * RFC 9457 application/problem+json error envelope (API_SPECIFICATION.md).
 */
export const ProblemDetailsSchema = z
  .object({
    type: z.string().url().or(z.literal('about:blank')),
    title: z.string().min(1),
    status: z.number().int().min(400).max(599),
    detail: z.string().optional(),
    instance: z.string().optional(),
    request_id: z.string().min(1),
  })
  .strict();

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export function createProblemDetails(params: {
  status: number;
  title: string;
  requestId: string;
  type?: string;
  detail?: string;
  instance?: string;
}): ProblemDetails {
  const result: ProblemDetails = {
    type: params.type ?? 'about:blank',
    title: params.title,
    status: params.status,
    request_id: params.requestId,
  };
  if (params.detail !== undefined) {
    result.detail = params.detail;
  }
  if (params.instance !== undefined) {
    result.instance = params.instance;
  }
  return result;
}
