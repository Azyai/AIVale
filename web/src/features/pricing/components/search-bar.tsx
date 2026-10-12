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
import { Search, X } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

export interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  placeholder?: string
  className?: string
}

export function SearchBar(props: SearchBarProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className={cn(
        'border-border/50 bg-muted/40 hover:border-border/70 focus-within:border-primary/40 focus-within:bg-background focus-within:ring-primary/20 relative flex h-9 items-center rounded-full border transition-all focus-within:ring-2',
        props.className
      )}
    >
      <Search className='text-muted-foreground/60 pointer-events-none absolute left-3.5 size-4' />
      <input
        ref={inputRef}
        type='text'
        placeholder={props.placeholder || t('Search models...')}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className='placeholder:text-muted-foreground/60 h-full w-full rounded-full bg-transparent pr-10 pl-10 text-sm outline-none'
        aria-label={t('Search models')}
      />
      <div className='absolute right-2.5 flex items-center gap-1'>
        {props.value ? (
          <button
            type='button'
            onClick={props.onClear}
            aria-label={t('Clear search')}
            className='text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 flex size-6 cursor-pointer items-center justify-center rounded-full transition-colors'
          >
            <X className='size-3.5' />
          </button>
        ) : null}
      </div>
    </div>
  )
}
