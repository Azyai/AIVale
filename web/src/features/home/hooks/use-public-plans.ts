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
import { useEffect, useState } from 'react'

import type { PublicSubscriptionPlan } from '../api'
import { fetchPublicPlans } from '../api'

const CACHE_KEY = 'public_subscription_plans'
const CACHE_TTL_MS = 5 * 60 * 1000

interface CachedPlans {
  plans: PublicSubscriptionPlan[]
  cachedAt: number
}

function readCache(): PublicSubscriptionPlan[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedPlans
    if (
      !parsed ||
      !Array.isArray(parsed.plans) ||
      Date.now() - parsed.cachedAt > CACHE_TTL_MS
    ) {
      return null
    }
    return parsed.plans
  } catch {
    return null
  }
}

function writeCache(plans: PublicSubscriptionPlan[]) {
  try {
    const payload: CachedPlans = { plans, cachedAt: Date.now() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Storage may be unavailable (private mode); cache is best-effort only.
  }
}

/**
 * Loads the sanitized public plan list for the pricing section. A short-lived
 * localStorage cache gives instant paint on repeat visits; the network result
 * always wins once it lands.
 */
export function usePublicPlans() {
  const [plans, setPlans] = useState<PublicSubscriptionPlan[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setPlans(cached)
    }
    let cancelled = false
    fetchPublicPlans()
      .then((data) => {
        if (cancelled) return
        setPlans(data)
        writeCache(data)
      })
      .catch(() => {
        // Keep cached plans (if any) on failure; fall back to pay-as-you-go.
      })
      .finally(() => {
        if (!cancelled) setIsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { plans, isLoaded }
}
