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
import type { PricingModel } from '../types'

/** Maximum models shown in the featured strip (mirrors backend validation). */
export const MAX_FEATURED_MODELS = 4

/**
 * Parse the PricingFeaturedModels option (JSON string array) tolerantly —
 * malformed values fall back to an empty list.
 */
export function parseFeaturedModelNames(raw?: string): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((name): name is string => typeof name === 'string')
      .map((name) => name.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Resolve the featured strip models: configured names first (in admin order,
 * skipping models that no longer exist), otherwise the first enabled models.
 * Always capped at MAX_FEATURED_MODELS.
 */
export function selectFeaturedModels(
  models: PricingModel[],
  rawConfig?: string
): PricingModel[] {
  if (models.length === 0) return []

  const configured = parseFeaturedModelNames(rawConfig)
  if (configured.length > 0) {
    const byName = new Map(
      models.map((model) => [model.model_name, model] as const)
    )
    const picked = configured
      .map((name) => byName.get(name))
      .filter((model): model is PricingModel => model != null)
    if (picked.length > 0) {
      return picked.slice(0, MAX_FEATURED_MODELS)
    }
  }

  return models.slice(0, MAX_FEATURED_MODELS)
}
