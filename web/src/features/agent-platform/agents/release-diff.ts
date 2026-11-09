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
import type { AgentConfig } from './schemas'

const fields = [
  ['name', 'Name'],
  ['instructions', 'Instructions'],
  ['model_policy', 'Model policy'],
  ['limits', 'Limits'],
  ['input_schema', 'Input schema'],
  ['output_schema', 'Output schema'],
  ['skill_bindings', 'Skill bindings'],
  ['tool_bindings', 'Tool bindings'],
] as const

export type AgentConfigurationDifference = {
  field: (typeof fields)[number][0]
  labelKey: (typeof fields)[number][1]
  before: string
  after: string
  changed: boolean
}

// Object key ordering is transport formatting, while array ordering is kept.
// This is a field comparison, not a model eligibility or security assessment.
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => {
          if (left < right) return -1
          if (left > right) return 1
          return 0
        })
        .map(([key, child]) => [key, canonicalValue(child)])
    )
  }
  return value
}

export function compareAgentConfigurations(
  before: AgentConfig,
  after: AgentConfig
): {
  groups: AgentConfigurationDifference[]
  modelChanged: boolean
  budgetIncreased: boolean
} {
  const groups = fields.map(([field, labelKey]) => {
    const left = JSON.stringify(canonicalValue(before[field]), null, 2)
    const right = JSON.stringify(canonicalValue(after[field]), null, 2)
    return {
      field,
      labelKey,
      before: left,
      after: right,
      changed: left !== right,
    }
  })
  return {
    groups,
    modelChanged: before.model_policy.model !== after.model_policy.model,
    budgetIncreased:
      BigInt(after.limits.max_cost_quota) >
      BigInt(before.limits.max_cost_quota),
  }
}
