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

import {
  agentConfigInputSchema,
  agentQuotaSchema,
  isAgentText,
  type AgentConfig,
} from './schemas'

const integer = (min: number, max: number) =>
  z
    .string()
    .regex(/^(0|[1-9][0-9]*)$/)
    .refine(
      (value) =>
        Number.isSafeInteger(Number(value)) &&
        Number(value) >= min &&
        Number(value) <= max
    )
function inlineObject(raw: string): Record<string, unknown> | undefined {
  if (!isAgentText(raw, 61440)) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return undefined
    }
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}
export const agentEditorFormSchema = z.object({
  instructions: z
    .string()
    .refine((value) => isAgentText(value, 32768) && value.trim() !== ''),
  model: z
    .string()
    .min(1)
    .refine(
      (value) =>
        isAgentText(value, 256) &&
        value.trim() === value &&
        !/\p{Cc}/u.test(value)
    ),
  maxOutputTokens: integer(1, 1073741823),
  temperature: z
    .string()
    .refine(
      (value) =>
        value === '' ||
        (/^(0|1|2)(\.\d{1,6})?$/.test(value) && Number(value) <= 2)
    ),
  maxSteps: integer(1, 64),
  timeoutSeconds: integer(1, 300),
  maxCostQuota: z.union([z.literal(''), agentQuotaSchema]),
  inputSchema: z.string().refine((value) => inlineObject(value) !== undefined),
  outputSchema: z.string().refine((value) => inlineObject(value) !== undefined),
})
export type AgentEditorValues = z.infer<typeof agentEditorFormSchema>
export function pendingEditorValues(_name = ''): AgentEditorValues {
  return {
    instructions: '',
    model: '',
    maxOutputTokens: '1024',
    temperature: '',
    maxSteps: '4',
    timeoutSeconds: '60',
    maxCostQuota: '',
    inputSchema: JSON.stringify(
      {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
      null,
      2
    ),
    outputSchema: '{}',
  }
}
export function configToEditorValues(config: AgentConfig): AgentEditorValues {
  return {
    instructions: config.instructions,
    model: config.model_policy.model,
    maxOutputTokens: String(config.model_policy.max_output_tokens),
    temperature:
      config.model_policy.temperature == null
        ? ''
        : String(config.model_policy.temperature),
    maxSteps: String(config.limits.max_steps),
    timeoutSeconds: String(config.limits.timeout_seconds),
    maxCostQuota: config.limits.max_cost_quota,
    inputSchema: JSON.stringify(config.input_schema, null, 2),
    outputSchema: JSON.stringify(config.output_schema, null, 2),
  }
}
export function editorValuesToConfig(values: AgentEditorValues, name: string) {
  const parsed = agentEditorFormSchema.parse(values)
  return agentConfigInputSchema.parse({
    schema_version: 1,
    name,
    instructions: parsed.instructions,
    model_policy: {
      model: parsed.model,
      max_output_tokens: Number(parsed.maxOutputTokens),
      ...(parsed.temperature === ''
        ? {}
        : { temperature: Number(parsed.temperature) }),
    },
    input_schema: inlineObject(parsed.inputSchema),
    output_schema: inlineObject(parsed.outputSchema),
    skill_bindings: [],
    tool_bindings: [],
    limits: {
      max_steps: Number(parsed.maxSteps),
      max_model_calls: 1,
      max_tool_calls: 0,
      timeout_seconds: Number(parsed.timeoutSeconds),
      ...(parsed.maxCostQuota === ''
        ? {}
        : { max_cost_quota: parsed.maxCostQuota }),
    },
  })
}
