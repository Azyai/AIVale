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
import { useQuery } from '@tanstack/react-query'
import * as echarts from 'echarts'

/** National map key; provinces use `rankings-<adcode>`. */
export const CHINA_MAP_KEY = 'rankings-china'

type MapSource = Parameters<typeof echarts.registerMap>[1]

/** Bump whenever web/public/geo is regenerated. Those files are served with a
 * one-week Cache-Control and, unlike the hashed JS/CSS bundles, keep a stable
 * URL — so without a version in the query a browser would keep drawing the old
 * geometry long after a deploy. */
const GEO_VERSION = '2'

// registerMap is global to the echarts instance, so a module-level guard keeps
// repeated mounts (route changes, period switches) from re-fetching.
const registeredMaps = new Set<string>()

const EMPTY_NAMES: string[] = []

/** Region names of a registered map — the landmark island's scope list. */
function featureNames(key: string): string[] {
  const geo = echarts.getMap(key)?.geoJson as
    | { features?: Array<{ properties?: { name?: string } }> }
    | undefined
  return (geo?.features ?? [])
    .map((feature) => feature.properties?.name)
    .filter((name): name is string => typeof name === 'string' && !!name)
}

async function registerMap(
  key: string,
  url: string
): Promise<{ key: string; names: string[] }> {
  if (!registeredMaps.has(key)) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`map ${key}: ${res.status}`)
    echarts.registerMap(key, (await res.json()) as MapSource)
    registeredMaps.add(key)
  }
  return { key, names: featureNames(key) }
}

/**
 * Loads and registers the GeoJSON a map series needs. `adcode` null means the
 * national map, undefined means "not resolvable yet" (no request is made),
 * otherwise it is a province whose city-level map is loaded. `mapKey` is the
 * registered map name to hand the chart, undefined until the geometry is ready;
 * `names` lists every region in that geometry.
 */
export function useRegionGeo(adcode: number | null | undefined) {
  const key = adcode == null ? CHINA_MAP_KEY : `rankings-${adcode}`
  const url =
    adcode == null
      ? `/geo/china.json?v=${GEO_VERSION}`
      : `/geo/provinces/${adcode}.json?v=${GEO_VERSION}`
  const query = useQuery({
    queryKey: ['rankings-geo', key],
    queryFn: () => registerMap(key, url),
    enabled: adcode !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
  })
  return {
    mapKey: query.data?.key,
    names: query.data?.names ?? EMPTY_NAMES,
    failed: query.isError,
  }
}
