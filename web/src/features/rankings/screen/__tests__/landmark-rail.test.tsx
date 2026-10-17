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
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LandmarkRail } from '../landmarks'

afterEach(cleanup)

describe('LandmarkRail', () => {
  it('renders one selectable chip per province and reports clicks by name', async () => {
    const onSelect = vi.fn()
    render(
      <LandmarkRail
        names={['广东省', '北京市', '新疆维吾尔自治区']}
        active={null}
        onSelect={onSelect}
        ariaLabel='drill'
      />
    )
    const chips = screen.getAllByRole('button')
    expect(chips).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: '北京市' }))
    expect(onSelect).toHaveBeenCalledWith('北京市')
  })

  it('marks only the focused province with aria-current', () => {
    render(
      <LandmarkRail
        names={['广东省', '北京市']}
        active='广东省'
        onSelect={vi.fn()}
        ariaLabel='drill'
      />
    )
    expect(screen.getByRole('button', { name: '广东省' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    expect(
      screen.getByRole('button', { name: '北京市' })
    ).not.toHaveAttribute('aria-current')
  })

  it('still renders a glyph for regions without a dedicated landmark', () => {
    render(
      <LandmarkRail
        names={['未知地区']}
        active={null}
        onSelect={vi.fn()}
        ariaLabel='drill'
      />
    )
    const chip = screen.getByRole('button', { name: '未知地区' })
    expect(chip.querySelector('svg path')).not.toBeNull()
  })

  it('renders nothing while the catalog has not loaded', () => {
    const { container } = render(
      <LandmarkRail names={[]} active={null} onSelect={vi.fn()} ariaLabel='drill' />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
