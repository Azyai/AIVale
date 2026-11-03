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

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { AgentPlatformCapabilities } from './types'

const capabilitiesSchema: z.ZodType<AgentPlatformCapabilities> = z.object({
  schema_version: z.literal(1),
  enabled: z.boolean(),
  worker_enabled: z.boolean(),
  mcp_enabled: z.boolean(),
  skills_enabled: z.boolean(),
  scripts_enabled: z.boolean(),
  runtime_ready: z.boolean(),
})

const responseSchema = z.object({
  success: z.literal(true),
  code: z.literal('OK'),
  message: z.string(),
  request_id: z.string().min(1).max(64),
  data: capabilitiesSchema,
})

/** Read current global capabilities; the server remains the admission authority. */
export async function getAgentPlatformCapabilities(
  signal?: AbortSignal
): Promise<AgentPlatformCapabilities> {
  const response = await api.get<unknown>('/api/agent-platform/capabilities', {
    signal,
    // React Query owns request sharing; unrelated signals must stay independent.
    disableDuplicate: true,
  })
  return responseSchema.parse(requireServerSuccess(response.data)).data
}
