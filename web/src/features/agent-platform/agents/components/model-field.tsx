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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import type { WorkspaceWriteSession } from '../../lib/workspace-write-transport'
import { listAgentModelOptions } from '../api'
import { usePrivateAgentQuery } from '../queries'

export function AgentModelField(props: {
  workspaceId: string
  session: WorkspaceWriteSession
  value: string
  verified: boolean
  disabled: boolean
  invalid: boolean
  onChange: (value: string) => void
  onAccessLost: () => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({ page: 1, page_size: 20, q: '' })
  const options = usePrivateAgentQuery(
    ['model-options', props.workspaceId, query],
    props.session,
    props.verified,
    (signal) => listAgentModelOptions(props.workspaceId, query, signal)
  )
  const page = options.data?.kind === 'ready' ? options.data.data : undefined
  useEffect(() => {
    if (options.data?.kind === 'unavailable') props.onAccessLost()
  }, [options.data, props])
  const live =
    options.isFetchedAfterMount &&
    options.fetchStatus === 'idle' &&
    !options.isError &&
    options.data?.kind === 'ready'
  return (
    <Field data-invalid={props.invalid}>
      <FieldLabel htmlFor='agent-model'>{t('Model')}</FieldLabel>
      <div className='flex flex-wrap gap-2'>
        <Input
          aria-label={t('Search models')}
          value={search}
          maxLength={128}
          className='min-w-40 flex-1'
          disabled={props.disabled}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              setQuery({ ...query, q: search, page: 1 })
            }
          }}
        />
        <Button
          type='button'
          variant='outline'
          disabled={props.disabled}
          onClick={() => setQuery({ ...query, q: search, page: 1 })}
        >
          {t('Search models')}
        </Button>
      </div>
      <NativeSelect
        id='agent-model'
        className='w-full'
        value={props.value}
        aria-invalid={props.invalid}
        disabled={props.disabled || !live}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <NativeSelectOption value=''>{t('Choose a model')}</NativeSelectOption>
        {props.value &&
          !page?.items.some((item) => item.model === props.value) && (
            <NativeSelectOption value={props.value} disabled>
              {t('Current model: {{model}}', { model: props.value })}
            </NativeSelectOption>
          )}
        {live &&
          page?.items.map((item) => (
            <NativeSelectOption
              key={item.model}
              value={item.model}
              disabled={!item.available}
            >
              {item.available
                ? item.model
                : t('{{model}} (unavailable)', { model: item.model })}
            </NativeSelectOption>
          ))}
      </NativeSelect>
      <FieldDescription>
        {t(
          'Only models available to this workspace can be saved. Availability is checked again when saving.'
        )}
      </FieldDescription>
      {options.isError || options.data?.kind === 'unavailable' ? (
        <div role='alert' className='flex items-center gap-2 text-sm'>
          <span>{t('Unable to load models.')}</span>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={() => void options.refetch()}
          >
            {t('Retry')}
          </Button>
        </div>
      ) : null}
      {options.isFetching && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t('Loading models...')}
        </p>
      )}
      {live && page?.items.length === 0 && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t('No models match your search.')}
        </p>
      )}
      {page && page.total > 20 && (
        <div className='flex gap-2'>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            disabled={props.disabled || !live || query.page === 1}
            onClick={() => setQuery({ ...query, page: query.page - 1 })}
          >
            {t('Previous models')}
          </Button>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            disabled={
              props.disabled ||
              !live ||
              query.page * query.page_size >= page.total
            }
            onClick={() => setQuery({ ...query, page: query.page + 1 })}
          >
            {t('Next models')}
          </Button>
        </div>
      )}
    </Field>
  )
}
