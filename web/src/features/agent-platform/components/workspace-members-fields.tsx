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
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { workspaceIdSchema } from '../lib/workspace-read-transport'
import {
  workspaceMemberRoleSchema,
  type WorkspaceMember,
  type WorkspaceMemberRole,
} from '../workspace-members-api'
import { WorkspaceRole } from './workspace-display'

function WorkspaceMemberRoleField(props: {
  value: WorkspaceMemberRole
  onChange: (role: WorkspaceMemberRole) => void
  owner: boolean
  disabled: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  const roles = workspaceMemberRoleSchema.options
    .filter(
      (role) => role !== 'admin' || props.owner || props.value === 'admin'
    )
    .map((value) => ({ value, label: <WorkspaceRole role={value} /> }))
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t('Role')}</FieldLabel>
      <Select
        items={roles}
        value={props.value}
        disabled={props.disabled}
        onValueChange={(value) => {
          if (value !== null && roles.some((role) => role.value === value)) {
            props.onChange(value)
          }
        }}
      >
        <SelectTrigger id={id} className='max-w-full min-w-44'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align='start' alignItemWithTrigger={false}>
          {roles.map(({ value, label }) => (
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
    </Field>
  )
}

export function WorkspaceMemberAddForm(props: {
  owner: boolean
  busy: boolean
  members: WorkspaceMember[]
  userId: string
  role: WorkspaceMemberRole
  onUserIdChange: (value: string) => void
  onRoleChange: (role: WorkspaceMemberRole) => void
  onAdd: (userId: string, role: WorkspaceMemberRole) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const id = useId()
  const canSubmit = !props.busy && (props.owner || props.role !== 'admin')
  const [error, setError] = useState<'invalid' | 'existing'>()
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    const target = workspaceIdSchema.safeParse(props.userId.trim())
    if (!target.success) {
      setError('invalid')
      return
    }
    if (props.members.some((member) => member.user_id === target.data)) {
      setError('existing')
      return
    }
    setError(undefined)
    if (await props.onAdd(target.data, props.role)) props.onUserIdChange('')
  }
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className='grid items-start gap-3 sm:grid-cols-[minmax(12rem,1fr)_auto_auto]'
    >
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={id}>{t('User ID')}</FieldLabel>
        <Input
          id={id}
          value={props.userId}
          onChange={(event) => {
            props.onUserIdChange(event.currentTarget.value)
            setError(undefined)
          }}
          inputMode='numeric'
          autoComplete='off'
          disabled={props.busy}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
        />
        <FieldDescription id={`${id}-hint`}>
          {t('Enter the user ID of an existing team member.')}
        </FieldDescription>
        {error && (
          <FieldError id={`${id}-error`}>
            {error === 'invalid'
              ? t('Enter a valid user ID.')
              : t(
                  'This user already has a workspace grant. Manage it from the list.'
                )}
          </FieldError>
        )}
      </Field>
      <WorkspaceMemberRoleField
        value={props.role}
        owner={props.owner}
        disabled={props.busy}
        onChange={props.onRoleChange}
      />
      <Button
        type='submit'
        className='justify-self-start sm:mt-6'
        disabled={!canSubmit}
      >
        {t('Add member')}
      </Button>
    </form>
  )
}

export function WorkspaceMemberEditDialog(props: {
  member: WorkspaceMember
  owner: boolean
  busy: boolean
  role: WorkspaceMemberRole
  onRoleChange: (role: WorkspaceMemberRole) => void
  onClose: () => void
  onSave: (role: WorkspaceMemberRole) => void
}) {
  const { t } = useTranslation()
  const active = props.member.status === 'active'
  const canSubmit =
    !props.busy &&
    (props.owner || props.role !== 'admin') &&
    (!active || props.role !== props.member.role)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !props.busy) props.onClose()
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {active ? t('Change role') : t('Restore access')}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit) props.onSave(props.role)
          }}
          className='space-y-4'
        >
          <WorkspaceMemberRoleField
            value={props.role}
            owner={props.owner}
            disabled={props.busy}
            onChange={props.onRoleChange}
          />
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={props.onClose}
              disabled={props.busy}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={!canSubmit}>
              {t('Save changes')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
