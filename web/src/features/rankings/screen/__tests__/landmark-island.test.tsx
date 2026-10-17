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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LandmarkIsland } from '../landmarks'
import type { SignatureEntry } from '../signatures'

const HINT = 'Hover over the map to see local landmarks and flavors'
const CANTON: SignatureEntry = {
  name: '广东省',
  glyph: '广东省',
  landmark: '广州塔',
  food: '广式早茶',
}
const CAPITAL: SignatureEntry = {
  name: '北京市',
  glyph: '北京市',
  landmark: '天坛祈年殿',
  food: '北京烤鸭',
}

afterEach(cleanup)

describe('LandmarkIsland', () => {
  it('stays collapsed on the hint while nothing is hovered', () => {
    render(<LandmarkIsland entry={null} hint={HINT} />)
    const island = screen.getByTitle(HINT)
    expect(island).toHaveAttribute('data-expanded', 'false')
    expect(island.querySelector('svg')).toBeNull()
    expect(island.querySelector('.bsc-island-expanded')).toBeNull()
  })

  it('expands onto the region under the pointer with its landmark and dish', () => {
    render(<LandmarkIsland entry={CANTON} hint={HINT} />)
    const island = screen.getByTitle('广东省 · 广州塔 · 广式早茶')
    expect(island).toHaveAttribute('data-expanded', 'true')
    expect(screen.getByText('广州塔')).toBeInTheDocument()
    expect(screen.getByText('广式早茶')).toBeInTheDocument()
    expect(island.querySelector('svg path')).not.toBeNull()
  })

  it('follows the pointer from one region to the next', () => {
    const { rerender } = render(<LandmarkIsland entry={CANTON} hint={HINT} />)
    expect(screen.getByText('广州塔')).toBeInTheDocument()
    rerender(<LandmarkIsland entry={CAPITAL} hint={HINT} />)
    expect(screen.queryByText('广州塔')).toBeNull()
    expect(screen.getByText('天坛祈年殿')).toBeInTheDocument()
  })

  it('draws a single tag for a place known only for its landmark', () => {
    render(
      <LandmarkIsland
        entry={{ name: '东城区', glyph: '北京市', landmark: '故宫太和殿' }}
        hint={HINT}
      />
    )
    expect(screen.getByTitle('东城区 · 故宫太和殿')).toHaveAttribute(
      'data-expanded',
      'true'
    )
    expect(document.querySelectorAll('.bsc-island-tag')).toHaveLength(1)
  })

  it('collapses back to the hint when the pointer leaves the map', () => {
    const { rerender } = render(<LandmarkIsland entry={CANTON} hint={HINT} />)
    rerender(<LandmarkIsland entry={null} hint={HINT} />)
    expect(screen.getByTitle(HINT)).toHaveAttribute('data-expanded', 'false')
  })
})
