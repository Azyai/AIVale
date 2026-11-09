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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import type { AgentListSearch } from '../schemas'

export function AgentListFilters(props: {
  search: AgentListSearch
  onChange: (search: AgentListSearch) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(props.search.q)
  const [tag, setTag] = useState(props.search.tag)
  return (
    <form
      className='mb-5 flex flex-wrap items-end gap-3'
      onSubmit={(event) => {
        event.preventDefault()
        props.onChange({ ...props.search, q: name, tag, page: 1 })
      }}
    >
      <Field className='min-w-40 flex-1'>
        <FieldLabel htmlFor='agent-name-filter'>
          {t('Search Agents')}
        </FieldLabel>
        <Input
          id='agent-name-filter'
          value={name}
          maxLength={128}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field className='w-full sm:w-40'>
        <FieldLabel htmlFor='agent-tag-filter'>{t('Tag')}</FieldLabel>
        <Input
          id='agent-tag-filter'
          value={tag}
          maxLength={64}
          onChange={(event) => setTag(event.target.value)}
        />
      </Field>
      <Field className='w-full sm:w-36'>
        <FieldLabel htmlFor='agent-status-filter'>{t('Status')}</FieldLabel>
        <NativeSelect
          id='agent-status-filter'
          className='w-full'
          value={props.search.status}
          onChange={(event) =>
            props.onChange({
              ...props.search,
              status: event.target.value as AgentListSearch['status'],
              page: 1,
            })
          }
        >
          {(['', 'active', 'disabled', 'archived'] as const).map((value) => (
            <NativeSelectOption key={value} value={value}>
              {t(
                {
                  '': 'All statuses',
                  active: 'Active',
                  disabled: 'Disabled',
                  archived: 'Archived',
                }[value]
              )}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field className='w-full sm:w-40'>
        <FieldLabel htmlFor='agent-sort-filter'>{t('Sort')}</FieldLabel>
        <NativeSelect
          id='agent-sort-filter'
          className='w-full'
          value={props.search.sort}
          onChange={(event) =>
            props.onChange({
              ...props.search,
              sort: event.target.value as AgentListSearch['sort'],
              page: 1,
            })
          }
        >
          <NativeSelectOption value='created_at:desc,id:desc'>
            {t('Newest first')}
          </NativeSelectOption>
          <NativeSelectOption value='created_at:asc,id:asc'>
            {t('Oldest first')}
          </NativeSelectOption>
          <NativeSelectOption value='id:asc'>
            {t('ID (ascending)')}
          </NativeSelectOption>
          <NativeSelectOption value='id:desc'>
            {t('ID (descending)')}
          </NativeSelectOption>
        </NativeSelect>
      </Field>
      <Button type='submit' variant='outline'>
        {t('Search')}
      </Button>
    </form>
  )
}
