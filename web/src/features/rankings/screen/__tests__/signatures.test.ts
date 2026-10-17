/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { signatureFor } from '../signatures'

describe('signatureFor', () => {
  it('returns the region own signature at the national level', () => {
    expect(signatureFor('广东省', null)).toEqual({
      name: '广东省',
      glyph: '广东省',
      landmark: '广州塔',
      food: '广式早茶',
    })
  })

  it('draws a drilled-down city with its province glyph', () => {
    expect(signatureFor('广州市', '广东省')).toMatchObject({
      name: '广州市',
      glyph: '广东省',
      landmark: '广州塔',
    })
  })

  it('falls back to the province for a city it has no entry for', () => {
    expect(signatureFor('某个未知区', '广东省')).toEqual({
      name: '广东省',
      glyph: '广东省',
      landmark: '广州塔',
      food: '广式早茶',
    })
  })

  it('returns null when nothing is known about the region', () => {
    expect(signatureFor('某个未知区', null)).toBeNull()
    expect(signatureFor(null, '广东省')).toBeNull()
  })

  it('keeps landmark-only entries for places without a signature dish', () => {
    expect(signatureFor('朝阳区', '北京市')).toEqual({
      name: '朝阳区',
      glyph: '北京市',
      landmark: '国家体育场鸟巢',
    })
  })

  // The island promises something about *every* region the map can draw, so a
  // regenerated GeoJSON that adds a name must fail here rather than silently
  // degrade to the province fallback.
  it('covers every region in the bundled GeoJSON', () => {
    const geoDir = resolve(process.cwd(), 'public/geo')
    const files = [
      resolve(geoDir, 'china.json'),
      ...readdirSync(resolve(geoDir, 'provinces')).map((f) =>
        resolve(geoDir, 'provinces', f)
      ),
    ]
    const missing: string[] = []
    for (const file of files) {
      const geo = JSON.parse(readFileSync(file, 'utf8')) as {
        features: Array<{ properties?: { name?: string } }>
      }
      for (const feature of geo.features) {
        const name = feature.properties?.name
        // province null: only a direct entry answers, no fallback to hide a gap
        if (name && !signatureFor(name, null)) missing.push(name)
      }
    }
    expect(missing).toEqual([])
  })
})
