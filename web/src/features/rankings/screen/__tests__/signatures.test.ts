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
})
