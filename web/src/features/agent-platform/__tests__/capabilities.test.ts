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
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ZodError } from 'zod'

import { api } from '@/lib/api'

import { getAgentPlatformCapabilities } from '../api'
import type { AgentPlatformCapabilities } from '../types'

const disabled: AgentPlatformCapabilities = {
  schema_version: 1,
  enabled: false,
  worker_enabled: false,
  mcp_enabled: false,
  skills_enabled: false,
  scripts_enabled: false,
  runtime_ready: false,
}

const response = {
  success: true,
  code: 'OK',
  message: '',
  request_id: 'p00-t05-capabilities-fixture',
  data: disabled,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Agent platform capability client', () => {
  test('reads disabled capabilities while tolerating future optional fields', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        ...response,
        future_envelope_field: 'compatible',
        data: { ...disabled, future_capability: true },
      },
    })

    await expect(getAgentPlatformCapabilities()).resolves.toEqual(disabled)
    expect(get).toHaveBeenCalledWith('/api/agent-platform/capabilities')
  })

  test('keeps runtime unavailable when every configuration switch is enabled', async () => {
    const enabled: AgentPlatformCapabilities = {
      schema_version: 1,
      enabled: true,
      worker_enabled: true,
      mcp_enabled: true,
      skills_enabled: true,
      scripts_enabled: true,
      runtime_ready: false,
    }
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { ...response, data: enabled },
    })

    await expect(getAgentPlatformCapabilities()).resolves.toEqual(enabled)
  })

  test('rejects a business failure and preserves the original response', async () => {
    const failure = {
      success: false,
      code: 'AG_RUNTIME_UNAVAILABLE',
      message: 'Agent platform capability is unavailable',
      request_id: 'p00-t05-failure-fixture',
      data: { field_errors: [], retryable: false },
    }
    vi.spyOn(api, 'get').mockResolvedValue({ data: failure })

    await expect(getAgentPlatformCapabilities()).rejects.toMatchObject({
      message: failure.message,
      cause: failure,
    })
  })

  test.each([
    { name: 'missing data', payload: { ...response, data: undefined } },
    {
      name: 'missing configuration fields',
      payload: {
        ...response,
        data: { schema_version: 1, runtime_ready: false },
      },
    },
    {
      name: 'a string switch',
      payload: { ...response, data: { ...disabled, enabled: 'true' } },
    },
    {
      name: 'numeric readiness',
      payload: { ...response, data: { ...disabled, runtime_ready: 1 } },
    },
    {
      name: 'an unsupported schema version',
      payload: { ...response, data: { ...disabled, schema_version: 2 } },
    },
    {
      name: 'a missing success marker',
      payload: { ...response, success: undefined },
    },
    { name: 'an empty request ID', payload: { ...response, request_id: '' } },
  ])(
    'rejects $name without inferring capability availability',
    async ({ payload }) => {
      vi.spyOn(api, 'get').mockResolvedValue({ data: payload })

      await expect(getAgentPlatformCapabilities()).rejects.toBeInstanceOf(
        ZodError
      )
    }
  )

  test('propagates HTTP rejection without replacing its error identity', async () => {
    const failure = new Error('network unavailable')
    vi.spyOn(api, 'get').mockRejectedValue(failure)

    await expect(getAgentPlatformCapabilities()).rejects.toBe(failure)
  })
})
