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
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  workspaceListSearchSchema,
  workspaceNameFilterSchema,
  type WorkspaceListSearch,
} from '../lib/workspace-list-search'

export type WorkspaceListControls = {
  search: WorkspaceListSearch
  onSearchChange: (search: WorkspaceListSearch) => void
}

const PAGE_SIZES = [10, 20, 50, 100]

export function WorkspaceListFilters(props: WorkspaceListControls) {
  const { t } = useTranslation()
  const sortId = useId()
  const sizeId = useId()
  const sortOptions = [
    { value: 'created_at:desc,id:desc', label: t('Newest first') },
    { value: 'created_at:asc,id:desc', label: t('Oldest first') },
    {
      value: 'created_at:desc,id:asc',
      label: t('Newest first, then lowest ID'),
    },
    {
      value: 'created_at:asc,id:asc',
      label: t('Oldest first, then lowest ID'),
    },
    { value: 'id:asc', label: t('Workspace ID ascending') },
    { value: 'id:desc', label: t('Workspace ID descending') },
  ]
  const pageSizes = [...new Set([...PAGE_SIZES, props.search.page_size])]
    .sort((a, b) => a - b)
    .map((size) => ({ value: size, label: String(size) }))

  return (
    <div className='mb-4 flex flex-wrap items-start gap-3'>
      <WorkspaceNameFilter {...props} />
      <div className='flex flex-wrap items-end gap-3'>
        <div className='max-w-full min-w-0 space-y-1.5'>
          <Label htmlFor={sortId}>{t('Sort by')}</Label>
          <Select
            items={sortOptions}
            value={props.search.sort}
            onValueChange={(sort) => {
              if (!sort) return
              props.onSearchChange(
                workspaceListSearchSchema.parse({
                  ...props.search,
                  sort,
                  page: 1,
                })
              )
            }}
          >
            <SelectTrigger id={sortId} className='max-w-full min-w-36'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align='start'
              alignItemWithTrigger={false}
              className='min-w-52'
            >
              {sortOptions.map(({ value, label }) => (
                <SelectItem
                  key={value}
                  value={value}
                  className='[&_[data-slot=select-item-text]]:whitespace-normal'
                >
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor={sizeId}>{t('Rows per page')}</Label>
          <Select
            items={pageSizes}
            value={props.search.page_size}
            onValueChange={(size) => {
              if (size === null) return
              props.onSearchChange({
                ...props.search,
                page: 1,
                page_size: size,
              })
            }}
          >
            <SelectTrigger id={sizeId} className='min-w-20'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align='start' alignItemWithTrigger={false}>
              {pageSizes.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

function WorkspaceNameFilter(props: WorkspaceListControls) {
  const { t } = useTranslation()
  const fieldId = useId()
  const errorId = useId()
  const [appliedName, setAppliedName] = useState(props.search.q)
  const [name, setName] = useState(props.search.q)
  const [invalid, setInvalid] = useState(false)
  // Back/forward navigation restores the applied filter without replacing the input.
  if (props.search.q !== appliedName) {
    setAppliedName(props.search.q)
    setName(props.search.q)
    setInvalid(false)
  }

  return (
    <form
      role='search'
      aria-label={t('Search workspaces')}
      className='min-w-0 basis-full sm:grow sm:basis-auto'
      onSubmit={(event) => {
        event.preventDefault()
        const filter = workspaceNameFilterSchema.safeParse(name)
        setInvalid(!filter.success)
        if (!filter.success) return
        setName(filter.data)
        if (filter.data !== props.search.q) {
          props.onSearchChange({ ...props.search, q: filter.data, page: 1 })
        }
      }}
    >
      <Label htmlFor={fieldId}>{t('Workspace name')}</Label>
      <div className='mt-1.5 flex min-w-0 flex-wrap items-center gap-2'>
        <Input
          id={fieldId}
          name='q'
          autoComplete='off'
          value={name}
          className='h-8 min-w-28 flex-1'
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => {
            setName(event.target.value)
            setInvalid(false)
          }}
        />
        <Button type='submit' variant='secondary' size='sm'>
          {t('Search')}
        </Button>
        {props.search.q !== '' && (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={() =>
              props.onSearchChange({ ...props.search, q: '', page: 1 })
            }
          >
            {t('Clear search')}
          </Button>
        )}
      </div>
      {invalid && (
        <p id={errorId} role='alert' className='text-destructive mt-1 text-sm'>
          {t('Enter a valid workspace name filter of up to 128 characters.')}
        </p>
      )}
    </form>
  )
}
