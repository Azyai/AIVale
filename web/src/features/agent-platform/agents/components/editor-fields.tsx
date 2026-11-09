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
import { useId } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import type { WorkspaceWriteSession } from '../../lib/workspace-write-transport'
import type { AgentEditorValues } from '../form'
import { AgentModelField } from './model-field'

export function AgentEditorFields(props: {
  form: UseFormReturn<AgentEditorValues>
  workspaceId: string
  session: WorkspaceWriteSession
  verified: boolean
  disabled: boolean
  onAccessLost: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const form = props.form
  const errors = form.formState.errors
  const model = form.watch('model')
  return (
    <FieldGroup className='gap-8'>
      <Field data-invalid={Boolean(errors.instructions)}>
        <FieldLabel htmlFor={`${id}-instructions`}>
          {t('Instructions')}
        </FieldLabel>
        <Textarea
          id={`${id}-instructions`}
          rows={9}
          className='min-h-48 leading-relaxed'
          disabled={props.disabled}
          aria-required='true'
          aria-invalid={Boolean(errors.instructions)}
          {...form.register('instructions')}
        />
        <FieldDescription>
          {t(
            'Describe what this Agent should do and the boundaries it must follow.'
          )}
        </FieldDescription>
        {errors.instructions && (
          <FieldError>
            {t('Enter nonblank instructions of up to 32 KiB.')}
          </FieldError>
        )}
      </Field>
      <FieldSet>
        <FieldLegend>{t('Model and limits')}</FieldLegend>
        <FieldGroup className='gap-5'>
          <AgentModelField
            workspaceId={props.workspaceId}
            session={props.session}
            value={model}
            verified={props.verified}
            disabled={props.disabled}
            invalid={Boolean(errors.model)}
            onAccessLost={props.onAccessLost}
            onChange={(value) =>
              form.setValue('model', value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          {errors.model && (
            <FieldError>{t('Choose an available model.')}</FieldError>
          )}
          <div className='grid gap-5 sm:grid-cols-2'>
            {(
              [
                ['maxOutputTokens', 'Maximum output tokens', '1–1073741823'],
                ['temperature', 'Temperature (optional)', '0–2'],
                ['maxSteps', 'Step limit', '1–64'],
                ['timeoutSeconds', 'Timeout (seconds)', '1–300'],
                ['maxCostQuota', 'Budget limit (quota)', ''],
              ] as const
            ).map(([field, label, placeholder]) => (
              <Field key={field} data-invalid={Boolean(errors[field])}>
                <FieldLabel htmlFor={`${id}-${field}`}>{t(label)}</FieldLabel>
                <Input
                  id={`${id}-${field}`}
                  inputMode={field === 'temperature' ? 'decimal' : 'numeric'}
                  placeholder={placeholder}
                  disabled={props.disabled}
                  aria-invalid={Boolean(errors[field])}
                  {...form.register(field)}
                />
                {field === 'maxCostQuota' && (
                  <FieldDescription>
                    {t(
                      'Leave blank to use the workspace default. Quota is stored as a whole number.'
                    )}
                  </FieldDescription>
                )}
                {errors[field] && (
                  <FieldError>
                    {errors[field]?.type === 'server'
                      ? t('This value was rejected by the server.')
                      : t('Enter a value within the allowed range.')}
                  </FieldError>
                )}
              </Field>
            ))}
          </div>
          <FieldDescription>
            {t(
              'Text Agents use one model call and no tools. Workspace limits also apply.'
            )}
          </FieldDescription>
        </FieldGroup>
      </FieldSet>
      <Collapsible>
        <CollapsibleTrigger render={<Button type='button' variant='outline' />}>
          {t('Input and output schemas')}
        </CollapsibleTrigger>
        <CollapsibleContent className='mt-5'>
          <FieldGroup>
            {(['inputSchema', 'outputSchema'] as const).map((field) => (
              <Field key={field} data-invalid={Boolean(errors[field])}>
                <FieldLabel htmlFor={`${id}-${field}`}>
                  {field === 'inputSchema'
                    ? t('Input schema')
                    : t('Output schema')}
                </FieldLabel>
                <Textarea
                  id={`${id}-${field}`}
                  className='min-h-40 font-mono text-xs'
                  spellCheck={false}
                  rows={7}
                  disabled={props.disabled}
                  aria-invalid={Boolean(errors[field])}
                  {...form.register(field)}
                />
                {errors[field] && (
                  <FieldError>
                    {t('Enter a valid inline JSON object.')}
                  </FieldError>
                )}
              </Field>
            ))}
            <FieldDescription>
              {t(
                'Use inline JSON schemas. External references and executable expressions are not supported.'
              )}
            </FieldDescription>
          </FieldGroup>
        </CollapsibleContent>
      </Collapsible>
    </FieldGroup>
  )
}
