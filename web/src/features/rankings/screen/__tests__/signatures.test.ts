/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even implied WARRANTY of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { describe, expect, it } from 'vitest'

import { signatureEntries } from '../signatures'

describe('signatureEntries', () => {
  it('puts regions with usage ahead of the rest of the map in view', () => {
    const result = signatureEntries({
      dataNames: ['浙江省'],
      scopeNames: ['北京市', '浙江省', '广东省'],
      province: null,
    })
    expect(result.map((entry) => entry.name)).toEqual([
      '浙江省',
      '北京市',
      '广东省',
      '上海市',
      '四川省',
      '陕西省',
    ])
  })

  it('borrows the province glyph for its cities and falls back to the province', () => {
    const result = signatureEntries({
      dataNames: [],
      scopeNames: ['广州市', '某个未知区'],
      province: '广东省',
    })
    expect(result[0]).toMatchObject({
      name: '广州市',
      glyph: '广东省',
      landmark: '广州塔',
    })
    expect(result.map((entry) => entry.name)).toContain('广东省')
    expect(result.map((entry) => entry.name)).not.toContain('某个未知区')
  })

  it('caps the cycle at eight entries so the island stays readable', () => {
    const result = signatureEntries({
      dataNames: [],
      scopeNames: [
        '北京市',
        '天津市',
        '河北省',
        '山西省',
        '上海市',
        '江苏省',
        '浙江省',
        '安徽省',
        '福建省',
        '广东省',
      ],
      province: null,
    })
    expect(result).toHaveLength(8)
  })
})
