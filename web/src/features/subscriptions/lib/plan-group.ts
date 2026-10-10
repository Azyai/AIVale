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
// Groups subscription plans into qianwen-style pricing tiers: plans sharing
// the same (plan_type, tier) collapse into one card with monthly / quarterly /
// yearly cycle tabs. Plans without a tier (or with non-cycle durations such as
// day/hour/custom or multi-unit values like "6 months") stay standalone.

export const PRICING_CYCLE_ORDER = ['month', 'quarter', 'year'] as const
export type PricingCycle = (typeof PRICING_CYCLE_ORDER)[number]

export function isPricingCycle(unit: string): unit is PricingCycle {
  return (PRICING_CYCLE_ORDER as readonly string[]).includes(unit)
}

export interface GroupablePlan {
  tier?: string
  plan_type?: string
  duration_unit: string
  duration_value: number
  sort_order: number
}

export interface PlanTierGroup<T> {
  key: string
  tier: string
  planType: 'personal' | 'team'
  order: number
  byCycle: Partial<Record<PricingCycle, T>>
}

export function groupPlansByTier<T extends GroupablePlan>(
  plans: T[]
): { groups: PlanTierGroup<T>[]; standalone: T[] } {
  const groups = new Map<string, PlanTierGroup<T>>()
  const standalone: T[] = []
  for (const plan of plans) {
    const tier = (plan?.tier || '').trim()
    const unit = plan?.duration_unit
    const singleCycle =
      isPricingCycle(unit) && Number(plan?.duration_value || 0) === 1
    if (!tier || !singleCycle) {
      standalone.push(plan)
      continue
    }
    const planType = plan?.plan_type === 'team' ? 'team' : 'personal'
    const key = `${planType}::${tier}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        tier,
        planType,
        order: Number(plan?.sort_order || 0),
        byCycle: {},
      }
      groups.set(key, group)
    }
    // Earlier wins within a cycle: the backend sorts by sort_order desc, id
    // desc, so the first seen plan per cycle is the highest-priority one.
    if (!group.byCycle[unit]) {
      group.byCycle[unit] = plan
    }
    group.order = Math.max(group.order, Number(plan?.sort_order || 0))
  }
  return {
    groups: [...groups.values()].sort((a, b) => b.order - a.order),
    standalone,
  }
}

export function resolveCyclePlan<T>(
  group: PlanTierGroup<T>,
  cycle: PricingCycle
): { cycle: PricingCycle; plan: T } {
  const available = availableCycles(group)
  const resolved = available.includes(cycle) ? cycle : (available[0] as PricingCycle)
  return { cycle: resolved, plan: group.byCycle[resolved] as T }
}

export function availableCycles<T>(group: PlanTierGroup<T>): PricingCycle[] {
  return PRICING_CYCLE_ORDER.filter((c) => !!group.byCycle[c])
}
