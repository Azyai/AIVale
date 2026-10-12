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
import { cn } from '@/lib/utils'

/** Qianwen-style pill segmented control shared across public pages. */
export function PillTabs<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  size?: 'md' | 'sm'
  className?: string
  'aria-label'?: string
}) {
  return (
    <div
      role='tablist'
      aria-label={ariaLabel}
      className={cn(
        'border-border/50 bg-muted/40 inline-flex items-center gap-1 rounded-full border p-1.5',
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type='button'
            role='tab'
            aria-selected={active}
            className={cn(
              'cursor-pointer rounded-full font-medium transition-all duration-200',
              size === 'md' ? 'px-6 py-2 text-[15px]' : 'px-5 py-1.5 text-sm',
              active
                ? 'bg-background text-foreground shadow-md ring-primary/20 ring-1'
                : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            )}
            onClick={() => {
              // Re-clicking the active pill is a no-op (single-select).
              if (opt.value !== value) {
                onChange(opt.value)
              }
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
