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
import { useId, type ReactNode } from 'react'
import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import type { WorkspaceCreateFormValues } from '../lib/workspace-create-form'

export function WorkspaceCreateFields(props: {
  register: UseFormRegister<WorkspaceCreateFormValues>
  errors: FieldErrors<WorkspaceCreateFormValues>
  disabled: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <FieldGroup className='gap-4'>
      <WorkspaceCreateField
        id={`${id}-name`}
        label={t('Workspace name')}
        error={
          props.errors.name &&
          t('Enter a workspace name of up to 128 characters.')
        }
      >
        <Input
          id={`${id}-name`}
          aria-required='true'
          aria-invalid={Boolean(props.errors.name)}
          aria-describedby={props.errors.name ? `${id}-name-error` : undefined}
          disabled={props.disabled}
          {...props.register('name')}
        />
      </WorkspaceCreateField>
      <WorkspaceCreateField
        id={`${id}-description`}
        label={t('Description')}
        error={
          props.errors.description &&
          t('Enter a description of up to 4096 bytes.')
        }
      >
        <Textarea
          id={`${id}-description`}
          rows={3}
          aria-invalid={Boolean(props.errors.description)}
          aria-describedby={
            props.errors.description ? `${id}-description-error` : undefined
          }
          disabled={props.disabled}
          {...props.register('description')}
        />
      </WorkspaceCreateField>
      <WorkspaceCreateField
        id={`${id}-slug`}
        label={t('Slug (optional)')}
        hint={t('Leave blank to generate a slug automatically.')}
        error={
          props.errors.slug &&
          (props.errors.slug.type === 'conflict'
            ? t('This slug is already in use.')
            : t(
                'Start with a lowercase letter or number. Use up to 64 lowercase letters, numbers, hyphens, or underscores.'
              ))
        }
      >
        <Input
          id={`${id}-slug`}
          autoCapitalize='none'
          autoComplete='off'
          spellCheck={false}
          aria-invalid={Boolean(props.errors.slug)}
          aria-describedby={
            props.errors.slug
              ? `${id}-slug-hint ${id}-slug-error`
              : `${id}-slug-hint`
          }
          disabled={props.disabled}
          {...props.register('slug')}
        />
      </WorkspaceCreateField>
    </FieldGroup>
  )
}

function WorkspaceCreateField(props: {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <Field data-invalid={Boolean(props.error)}>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      {props.children}
      {props.hint && (
        <FieldDescription id={`${props.id}-hint`}>
          {props.hint}
        </FieldDescription>
      )}
      {props.error && (
        <FieldError id={`${props.id}-error`}>{props.error}</FieldError>
      )}
    </Field>
  )
}
