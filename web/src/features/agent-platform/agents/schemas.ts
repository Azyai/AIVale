/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { z } from 'zod'

import { workspaceIdSchema } from '../lib/workspace-read-transport'

const utf8 = new TextEncoder()
export function isAgentText(value: string, bytes: number, characters = bytes) {
  return (
    typeof value === 'string' &&
    !value.includes('\0') &&
    !/[\uD800-\uDFFF]/u.test(value) &&
    [...value].length <= characters &&
    utf8.encode(value).length <= bytes
  )
}
export const agentRevisionSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const name = z
  .string()
  .refine((value) => isAgentText(value, 512, 128) && value.trim() !== '')
export const agentQuotaSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,9})$/)
  .refine((value) => value.length < 10 || value <= '2147483647')
const jsonObject = z.record(z.string(), z.unknown())
export const agentConfigSchema = z
  .strictObject({
    schema_version: z.literal(1),
    name,
    instructions: z
      .string()
      .refine((value) => isAgentText(value, 32768) && value.trim() !== ''),
    model_policy: z.strictObject({
      model: z
        .string()
        .min(1)
        .refine(
          (value) =>
            isAgentText(value, 256) &&
            value.trim() === value &&
            !/\p{Cc}/u.test(value)
        ),
      temperature: z.number().min(0).max(2).optional(),
      max_output_tokens: z.number().int().positive().max(1073741823),
    }),
    input_schema: jsonObject,
    output_schema: jsonObject,
    skill_bindings: z.array(z.never()).max(0),
    tool_bindings: z.array(z.never()).max(0),
    limits: z.strictObject({
      max_steps: z.number().int().min(1).max(64),
      max_model_calls: z.literal(1),
      max_tool_calls: z.literal(0),
      timeout_seconds: z.number().int().min(1).max(300),
      max_cost_quota: agentQuotaSchema,
    }),
  })
  .refine((value) => utf8.encode(JSON.stringify(value)).length <= 61440)
export type AgentConfig = z.infer<typeof agentConfigSchema>
export const agentConfigInputSchema = z
  .strictObject({
    ...agentConfigSchema.shape,
    limits: agentConfigSchema.shape.limits.extend({
      max_cost_quota: agentQuotaSchema.optional(),
    }),
  })
  .refine((value) => utf8.encode(JSON.stringify(value)).length <= 61440)
export type AgentConfigInput = z.infer<typeof agentConfigInputSchema>
export const agentSummarySchema = z.strictObject({
  id: workspaceIdSchema,
  slug: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  name,
  created_at: time,
  updated_at: time,
  kind: z.literal('single'),
  status: z.enum(['active', 'disabled', 'archived']),
  tags: z
    .array(
      z
        .string()
        .min(1)
        .refine((value) => isAgentText(value, 256, 64))
    )
    .max(32)
    .refine((tags) => new Set(tags).size === tags.length),
  current_version_id: workspaceIdSchema.nullable(),
  effective_permissions: z.tuple([z.literal('agent:read')]),
})
export const agentDetailSchema = agentSummarySchema.extend({
  description: z.string().refine((value) => isAgentText(value, 4096)),
  revision: agentRevisionSchema,
  draft_revision: agentRevisionSchema,
})
export type AgentSummary = z.infer<typeof agentSummarySchema>
export type AgentDetail = z.infer<typeof agentDetailSchema>
export const agentDraftSchema = z.strictObject({
  id: workspaceIdSchema,
  revision: agentRevisionSchema,
  config: agentConfigSchema.nullable(),
})
export type AgentDraft = z.infer<typeof agentDraftSchema>
export function agentPageSchema<T>(item: z.ZodType<T>) {
  return z.strictObject({
    items: z.array(item).max(100),
    total: time,
    page: agentRevisionSchema,
    page_size: z.number().int().min(1).max(100),
  })
}
export const agentPageDataSchema = agentPageSchema(agentSummarySchema)
export type AgentPage = z.infer<typeof agentPageDataSchema>
const filter = z
  .string()
  .refine((value) => isAgentText(value, 512, 128))
  .default('')
export const agentListSearchSchema = z.object({
  page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).catch(1),
  page_size: z.coerce.number().int().min(1).max(100).catch(20),
  sort: z
    .enum([
      'created_at:desc,id:desc',
      'created_at:asc,id:asc',
      'id:asc',
      'id:desc',
    ])
    .catch('created_at:desc,id:desc'),
  q: filter.catch(''),
  status: z.enum(['', 'active', 'disabled', 'archived']).catch(''),
  tag: z
    .string()
    .refine((value) => isAgentText(value, 256, 64))
    .catch(''),
})
export type AgentListSearch = z.infer<typeof agentListSearchSchema>
export const agentCreateInputSchema = z.strictObject({
  name,
  description: z.string().refine((value) => isAgentText(value, 4096)),
  kind: z.literal('single'),
})
export type AgentCreateInput = z.infer<typeof agentCreateInputSchema>
export const modelOptionSchema = z
  .strictObject({
    model: z
      .string()
      .min(1)
      .refine((value) => isAgentText(value, 256)),
    available: z.boolean(),
    unavailable_reason: z.enum(['unavailable']).nullable(),
  })
  .refine((value) => value.available === (value.unavailable_reason === null))
export const modelOptionsSchema = agentPageSchema(modelOptionSchema)
export type AgentModelOptions = z.infer<typeof modelOptionsSchema>
export const validationReportSchema = z
  .strictObject({
    id: workspaceIdSchema,
    draft_revision: agentRevisionSchema,
    valid: z.boolean(),
    errors: z
      .array(
        z.strictObject({
          path: z.string().max(256),
          code: z.string().max(64),
          message: z.string().max(512),
        })
      )
      .max(100),
    warnings: z
      .array(
        z.strictObject({
          path: z.string().max(256),
          code: z.string().max(64),
          message: z.string().max(512),
        })
      )
      .max(100),
  })
  .refine((value) => value.valid === (value.errors.length === 0))
export type AgentValidationReport = z.infer<typeof validationReportSchema>
