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
import {
  agentConfigSchema,
  agentPageSchema,
  agentRevisionSchema,
  isAgentText,
} from './schemas'

// An ID must be the entire decimal string: regex $ alone also matches before
// a final newline in JavaScript.
export const releaseIdSchema = workspaceIdSchema.refine(
  (value) => value === value.trim()
)
const positiveTime = agentRevisionSchema
const hash = z
  .string()
  .length(64)
  .regex(/^[0-9a-f]{64}$/)
export const agentPublishedVersionSchema = z.strictObject({
  id: releaseIdSchema,
  agent_id: releaseIdSchema,
  version_no: agentRevisionSchema,
  version_kind: z.literal('release'),
  source_draft_revision: agentRevisionSchema,
  config_hash: hash,
  published_at: positiveTime,
})
export const agentVersionSummarySchema = agentPublishedVersionSchema.extend({
  revoked_at: positiveTime.nullable(),
  published_by: releaseIdSchema,
})
export const agentVersionDetailSchema = agentVersionSummarySchema.extend({
  config: agentConfigSchema,
  release_note: z.string().refine((value) => isAgentText(value, 4096)),
  validation_summary: z.strictObject({
    schema_version: z.literal(1),
    config_hash_verified: z.literal(true),
  }),
})
export const agentVersionPageSchema = agentPageSchema(
  agentVersionSummarySchema
).refine(
  (page) =>
    page.total >= page.items.length &&
    new Set(page.items.map((item) => item.id)).size === page.items.length
)
export const agentVersionListSearchSchema = z.strictObject({
  page: agentRevisionSchema,
  page_size: z.number().int().min(1).max(100),
  sort: z.enum([
    'id:asc',
    'id:desc',
    'created_at:asc',
    'created_at:desc',
    'created_at:asc,id:asc',
    'created_at:asc,id:desc',
    'created_at:desc,id:asc',
    'created_at:desc,id:desc',
  ]),
})
const reason = z
  .string()
  .refine((value) => isAgentText(value, 1024) && value.trim() !== '')
export const agentPublishInputSchema = z.strictObject({
  draft_revision: agentRevisionSchema,
  release_note: z
    .string()
    .refine((value) => isAgentText(value, 4096))
    .optional(),
})
export const agentRestoreInputSchema = z.strictObject({
  version_id: releaseIdSchema,
  expected_revision: agentRevisionSchema,
})
export const agentActivateInputSchema = agentRestoreInputSchema.extend({
  reason,
})
export const agentStatusInputSchema = z.strictObject({
  status: z.enum(['active', 'disabled']),
  expected_revision: agentRevisionSchema,
  reason,
})
export const agentArchiveInputSchema = z.strictObject({
  expected_revision: agentRevisionSchema,
  reason,
})
export const agentLifecycleStateSchema = z
  .strictObject({
    id: releaseIdSchema,
    status: z.enum(['active', 'disabled', 'archived']),
    revision: agentRevisionSchema,
    current_version_id: releaseIdSchema.nullable(),
    archived_at: positiveTime.nullable(),
  })
  .refine(
    (state) => (state.status === 'archived') === (state.archived_at !== null)
  )

export type AgentVersionSummary = z.infer<typeof agentVersionSummarySchema>
export type AgentVersionDetail = z.infer<typeof agentVersionDetailSchema>
export type AgentVersionPage = z.infer<typeof agentVersionPageSchema>
export type AgentVersionListSearch = z.infer<
  typeof agentVersionListSearchSchema
>
export type AgentPublishedVersion = z.infer<typeof agentPublishedVersionSchema>
export type AgentPublicationReceipt = AgentPublishedVersion & {
  idempotencyExpiresAt: number
}
export type AgentLifecycleState = z.infer<typeof agentLifecycleStateSchema>
export type AgentPublishInput = z.infer<typeof agentPublishInputSchema>
export type AgentRestoreInput = z.infer<typeof agentRestoreInputSchema>
export type AgentActivateInput = z.infer<typeof agentActivateInputSchema>
export type AgentStatusInput = z.infer<typeof agentStatusInputSchema>
export type AgentArchiveInput = z.infer<typeof agentArchiveInputSchema>
