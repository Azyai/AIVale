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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import type {
  AgentWorkspaceRole,
  AgentWorkspaceStatus,
} from '../workspace-list-api'

export function WorkspaceRole(props: { role: AgentWorkspaceRole }) {
  const { t } = useTranslation()
  switch (props.role) {
    case 'admin':
      return t('Workspace administrator')
    case 'developer':
      return t('Workspace developer')
    case 'operator':
      return t('Operator')
    case 'viewer':
      return t('Workspace viewer')
  }
}

export function WorkspaceStatus(props: { status: AgentWorkspaceStatus }) {
  const { t } = useTranslation()
  return props.status === 'active' ? (
    <Badge variant='secondary'>{t('Active')}</Badge>
  ) : (
    <Badge variant='outline'>{t('Suspended')}</Badge>
  )
}

export function WorkspaceDate(props: {
  timestamp: number
  format: Intl.DateTimeFormat
}) {
  const { t } = useTranslation()
  const date = new Date(props.timestamp)
  return Number.isNaN(date.getTime()) ? (
    <span aria-label={t('Not available')}>—</span>
  ) : (
    <time dateTime={date.toISOString()}>{props.format.format(date)}</time>
  )
}
