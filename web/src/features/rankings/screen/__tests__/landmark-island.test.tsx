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
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LandmarkIsland } from '../landmarks'
import type { SignatureEntry } from '../signatures'

const HINT = 'zoom to reveal'

const entries = (names: string[]): SignatureEntry[] =>
  names.map((name) => ({
    name,
    glyph: name,
    landmark: `${name}-地标`,
    food: `${name}-美食`,
  }))

afterEach(cleanup)

describe('LandmarkIsland', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays collapsed on the hint while the map is zoomed out', () => {
    render(
      <LandmarkIsland entries={entries(['广东省'])} expanded={false} hint={HINT} />
    )
    const island = screen.getByTitle(/广东省/)
    expect(island).toHaveAttribute('data-expanded', 'false')
    expect(island).toHaveTextContent(HINT)
  })

  it('shows the focused region landmark and dish once expanded', () => {
    render(
      <LandmarkIsland entries={entries(['广东省'])} expanded hint={HINT} />
    )
    const island = screen.getByTitle(/广东省/)
    expect(island).toHaveAttribute('data-expanded', 'true')
    expect(island).toHaveTextContent('广东省-地标')
    expect(island).toHaveTextContent('广东省-美食')
  })

  it('cycles to the next region after the display interval', () => {
    // The shared setup reports prefers-reduced-motion: reduce, so opt out here
    // to exercise the rotation itself.
    const original = window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string): MediaQueryList => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })
    try {
      render(
        <LandmarkIsland
          entries={entries(['广东省', '北京市'])}
          expanded
          hint={HINT}
        />
      )
      expect(screen.getByTitle(/广东省/)).toHaveTextContent('广东省-地标')
      act(() => {
        vi.advanceTimersByTime(4200)
      })
      expect(screen.getByTitle(/北京市/)).toHaveTextContent('北京市-美食')
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: original,
      })
    }
  })

  it('holds the first region when the visitor prefers reduced motion', () => {
    render(
      <LandmarkIsland
        entries={entries(['广东省', '北京市'])}
        expanded
        hint={HINT}
      />
    )
    act(() => {
      vi.advanceTimersByTime(9000)
    })
    expect(screen.getByTitle(/广东省/)).toHaveTextContent('广东省-地标')
  })

  it('keeps only the hint when no region has a curated signature', () => {
    render(<LandmarkIsland entries={[]} expanded={false} hint={HINT} />)
    const island = screen.getByTitle(HINT)
    expect(island).toHaveTextContent(HINT)
    expect(island.querySelector('svg')).toBeNull()
  })
})
