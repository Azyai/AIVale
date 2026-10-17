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
import { api } from '@/lib/api'

import type {
  RankingPeriod,
  RankingsSnapshot,
  RegionsCatalog,
  RegionsSnapshot,
} from './types'

type RankingsResponse = {
  success: boolean
  message?: string
  data: RankingsSnapshot
}

type RegionsResponse = {
  success: boolean
  message?: string
  data: RegionsSnapshot
}

export async function getRankings(
  period: RankingPeriod
): Promise<RankingsResponse> {
  const res = await api.get('/api/rankings', { params: { period } })
  return res.data
}

export async function getRankingRegions(
  period: RankingPeriod,
  province: string
): Promise<RegionsResponse> {
  const res = await api.get('/api/rankings/regions', {
    params: province ? { period, province } : { period },
  })
  return res.data
}

/** Static province → city cascade shipped with the map GeoJSON. */
export async function getRegionsCatalog(): Promise<RegionsCatalog> {
  const res = await fetch('/geo/regions.json')
  if (!res.ok) throw new Error(`regions catalog: ${res.status}`)
  return (await res.json()) as RegionsCatalog
}
