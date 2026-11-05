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
import { Archive, Pencil } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

import type { AgentWorkspaceDetail } from '../workspace-detail-api'
import type { WorkspaceWriteSession } from '../workspace-management-api'
import { WorkspaceArchiveForm } from './workspace-archive-form'
import { WorkspaceEditForm } from './workspace-edit-form'

export type WorkspaceManagementScope = {
  session: WorkspaceWriteSession
  workspace?: AgentWorkspaceDetail
  onReload: () => Promise<void>
  onAccessLost: () => void
}

export function WorkspaceManagementActions(
  props: WorkspaceManagementScope & {
    archiveHeld: boolean
    onArchiveHold: (active: boolean, recheck?: boolean) => void
    onSaved: () => void
    onArchived: () => void
  }
) {
  const { t } = useTranslation()
  const [editBase, setEditBase] = useState<AgentWorkspaceDetail>()
  const [archiveBase, setArchiveBase] = useState<AgentWorkspaceDetail>()
  const [busy, setBusy] = useState(false)

  return (
    <>
      <ManagementDialog
        kind='edit'
        title={t('Edit workspace')}
        description={t('Update the name or description of this workspace.')}
        allowed={Boolean(props.workspace) && !props.archiveHeld}
        open={Boolean(editBase)}
        busy={busy}
        onOpenChange={(open) => setEditBase(open ? props.workspace : undefined)}
      >
        {editBase && (
          <WorkspaceEditForm
            {...props}
            base={editBase}
            onBusy={setBusy}
            onClose={() => setEditBase(undefined)}
          />
        )}
      </ManagementDialog>
      <ManagementDialog
        kind='archive'
        title={t('Archive workspace')}
        description={t(
          'Archived workspaces leave the workbench. Their history is retained.'
        )}
        allowed={Boolean(props.workspace) && !props.archiveHeld}
        open={Boolean(archiveBase)}
        busy={busy}
        onOpenChange={(open) => {
          setArchiveBase(open ? props.workspace : undefined)
          if (!open && props.archiveHeld) props.onArchiveHold(false, true)
        }}
      >
        {archiveBase && (
          <WorkspaceArchiveForm
            {...props}
            base={archiveBase}
            onBusy={setBusy}
            onClose={() => {
              setArchiveBase(undefined)
              if (props.archiveHeld) props.onArchiveHold(false, true)
            }}
          />
        )}
      </ManagementDialog>
    </>
  )
}

function ManagementDialog(props: {
  kind: 'edit' | 'archive'
  title: string
  description: string
  allowed: boolean
  open: boolean
  busy: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const Icon = props.kind === 'edit' ? Pencil : Archive
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!props.busy && (!open || props.allowed)) props.onOpenChange(open)
      }}
    >
      {props.allowed && (
        <DialogTrigger render={<Button variant='outline' />}>
          <Icon aria-hidden='true' />
          {props.title}
        </DialogTrigger>
      )}
      <DialogContent showCloseButton={false} className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        {props.children}
      </DialogContent>
    </Dialog>
  )
}
