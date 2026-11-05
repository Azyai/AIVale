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
import {
  CancelledError,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination'

import { useWorkspaceWriteAttempt } from '../hooks/use-workspace-write-attempt'
import {
  isCurrentWorkspaceWriteSession,
  type WorkspaceWriteSession,
} from '../lib/workspace-write-transport'
import { useWorkspaceCreateEligibility } from '../queries'
import {
  canManageWorkspaceMember,
  listAgentWorkspaceMembers,
  putAgentWorkspaceMember,
  removeAgentWorkspaceMember,
  workspaceMembersPageSize,
  WorkspaceMembersReadError,
  WorkspaceMembersWriteError,
  type WorkspaceMember,
  type WorkspaceMemberRole,
} from '../workspace-members-api'
import {
  WorkspaceMemberAddForm,
  WorkspaceMemberEditDialog,
} from './workspace-members-fields'
import { WorkspaceMembersRoster } from './workspace-members-roster'

type MemberChange =
  | { kind: 'add'; userId: string; role: WorkspaceMemberRole }
  | { kind: 'update'; member: WorkspaceMember; role: WorkspaceMemberRole }
  | { kind: 'remove'; member: WorkspaceMember }

type Notice = 'conflict' | 'last-admin' | 'not-allowed' | 'failure' | 'saved'

export function WorkspaceMembersPanel(props: {
  workspaceId: string
  session: WorkspaceWriteSession
  verified: boolean
  onSelfChange: () => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<WorkspaceMember>()
  const [editRole, setEditRole] = useState<WorkspaceMemberRole>('viewer')
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState<WorkspaceMemberRole>('viewer')
  const [removing, setRemoving] = useState<WorkspaceMember>()
  const [notice, setNotice] = useState<Notice>()
  const [selfChanged, setSelfChanged] = useState(false)
  const actorId = String(props.session.userId)
  const attempt = useWorkspaceWriteAttempt(props.session)
  const { query: eligibility } = useWorkspaceCreateEligibility()
  const ownerVerified =
    eligibility.isSuccess &&
    eligibility.isFetchedAfterMount &&
    eligibility.fetchStatus === 'idle'
  const owner = ownerVerified ? eligibility.data.can_create : undefined
  const client = useQueryClient()
  const verified = useRef(false)
  const queryKey = useMemo(
    () => [
      'agent-platform',
      'workspace-members',
      props.session.userId,
      props.session.sessionId,
      props.workspaceId,
      page,
    ],
    [props.session.userId, props.session.sessionId, props.workspaceId, page]
  )

  const query = useQuery({
    queryKey,
    enabled: props.verified && !selfChanged,
    queryFn: async ({ signal }) => {
      if (!isCurrentWorkspaceWriteSession(props.session)) {
        throw new CancelledError({ silent: true })
      }
      const result = await listAgentWorkspaceMembers(
        props.workspaceId,
        page,
        signal
      )
      if (!isCurrentWorkspaceWriteSession(props.session)) {
        throw new CancelledError({ silent: true })
      }
      return result
    },
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    meta: { errorToast: false, errorRedirect: false },
  })
  useLayoutEffect(() => {
    verified.current = props.verified
    if (!props.verified) void client.cancelQueries({ queryKey, exact: true })
  }, [client, props.verified, queryKey])
  const data =
    props.verified &&
    query.isSuccess &&
    query.isFetchedAfterMount &&
    query.fetchStatus === 'idle'
      ? query.data
      : undefined

  const mutation = useMutation({
    retry: false,
    networkMode: 'always',
    gcTime: 0,
    meta: { errorToast: false, errorRedirect: false },
    mutationFn: async ({
      change,
      signal,
    }: {
      change: MemberChange
      signal: AbortSignal
    }) => {
      if (change.kind === 'remove') {
        await removeAgentWorkspaceMember(
          props.workspaceId,
          change.member.user_id,
          props.session,
          signal
        )
      } else if (change.kind === 'update') {
        await putAgentWorkspaceMember(
          props.workspaceId,
          change.member.user_id,
          { role: change.role, expected_revision: change.member.revision },
          props.session,
          signal
        )
      } else {
        await putAgentWorkspaceMember(
          props.workspaceId,
          change.userId,
          { role: change.role, expected_revision: 0 },
          props.session,
          signal
        )
      }
    },
  })

  async function write(change: MemberChange): Promise<boolean> {
    if (!verified.current || !data || selfChanged) return false
    const userId = change.kind === 'add' ? change.userId : change.member.user_id
    if (change.kind !== 'add') {
      const current = data.items.find((row) => row.user_id === userId)
      if (!current || current.revision !== change.member.revision) {
        setNotice('conflict')
        setEditing(undefined)
        setRemoving(undefined)
        void query.refetch()
        return false
      }
      if (!canManageWorkspaceMember(current, actorId, owner)) {
        setNotice('not-allowed')
        setEditing(undefined)
        setRemoving(undefined)
        return false
      }
    }
    if (change.kind !== 'remove' && change.role === 'admin' && !owner) {
      setNotice('not-allowed')
      return false
    }

    const controller = attempt.begin()
    if (!controller) return false
    setNotice(undefined)
    try {
      await mutation.mutateAsync({ change, signal: controller.signal })
      if (!attempt.current(controller)) return false
      setEditing(undefined)
      setRemoving(undefined)
      if (userId === actorId) {
        setSelfChanged(true)
        props.onSelfChange()
        return true
      }
      setNotice('saved')
      if (change.kind === 'add' && page !== 1) setPage(1)
      else if (verified.current) void query.refetch()
      return true
    } catch (error) {
      if (!attempt.current(controller)) return false
      setEditing(undefined)
      setRemoving(undefined)
      if (error instanceof WorkspaceMembersWriteError && error.status === 401) {
        setSelfChanged(true)
        props.onSelfChange()
        return false
      }
      setNotice(workspaceMemberWriteNotice(error))
      // A revision or authorization failure can also invalidate the visible roster.
      if (
        verified.current &&
        error instanceof WorkspaceMembersWriteError &&
        [403, 404, 409].includes(error.status ?? 0)
      ) {
        void query.refetch()
      }
      return false
    } finally {
      attempt.finish(controller)
    }
  }

  if (selfChanged || !props.verified) {
    return (
      <div role='status'>
        <LoadingState message={t('Loading workspace...')} />
      </div>
    )
  }

  if (query.isError || query.fetchStatus === 'paused') {
    const forbidden =
      query.error instanceof WorkspaceMembersReadError &&
      [401, 403, 404].includes(query.error.status ?? 0)
    return (
      <div role='alert' className='mt-4'>
        <ErrorState
          title={t('Unable to load workspace members')}
          description={
            forbidden
              ? t('You cannot manage this workspace member.')
              : t('Check your connection and try again.')
          }
          onRetry={() => void query.refetch()}
          className='min-h-40'
        />
      </div>
    )
  }

  if (!data) {
    return (
      <div role='status'>
        <LoadingState message={t('Loading workspace...')} />
      </div>
    )
  }

  return (
    <div className='mt-5 space-y-4'>
      <WorkspaceMemberAddForm
        owner={owner === true}
        busy={mutation.isPending}
        members={data.items}
        userId={addUserId}
        role={addRole}
        onUserIdChange={setAddUserId}
        onRoleChange={setAddRole}
        onAdd={(userId, role) => write({ kind: 'add', userId, role })}
      />
      {notice && (
        <div
          role={notice === 'saved' ? 'status' : 'alert'}
          className={
            notice === 'saved'
              ? 'text-muted-foreground text-sm'
              : 'text-destructive text-sm'
          }
        >
          {notice === 'saved' && t('Workspace membership updated.')}
          {notice === 'last-admin' &&
            t('This change would remove the last effective administrator.')}
          {notice === 'conflict' &&
            t('The membership changed. Reload the list and try again.')}
          {notice === 'not-allowed' &&
            t('You cannot manage this workspace member.')}
          {notice === 'failure' && t('Unable to update workspace membership')}
        </div>
      )}
      <WorkspaceMembersRoster
        members={data.items}
        owner={owner}
        actorId={actorId}
        busy={mutation.isPending}
        onEdit={(member) => {
          setEditRole(member.role)
          setEditing(member)
        }}
        onRemove={setRemoving}
      />
      {(page > 1 || page * workspaceMembersPageSize < data.total) && (
        <Pagination aria-label={t('Workspace members')} className='justify-end'>
          <PaginationContent>
            <PaginationItem>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={page <= 1 || mutation.isPending}
                onClick={() => setPage(page - 1)}
              >
                {t('Previous')}
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={
                  page * workspaceMembersPageSize >= data.total ||
                  mutation.isPending
                }
                onClick={() => setPage(page + 1)}
              >
                {t('Next')}
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
      {editing && canManageWorkspaceMember(editing, actorId, owner) && (
        <WorkspaceMemberEditDialog
          member={editing}
          owner={owner === true}
          busy={mutation.isPending}
          role={editRole}
          onRoleChange={setEditRole}
          onClose={() => setEditing(undefined)}
          onSave={(role) =>
            void write({ kind: 'update', member: editing, role })
          }
        />
      )}
      {removing && canManageWorkspaceMember(removing, actorId, owner) && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !mutation.isPending) setRemoving(undefined)
          }}
          title={t('Remove member')}
          desc={t('Remove workspace access for user {{id}}?', {
            id: removing.user_id,
          })}
          confirmText={t('Remove member')}
          destructive
          isLoading={mutation.isPending}
          handleConfirm={() => void write({ kind: 'remove', member: removing })}
        />
      )}
    </div>
  )
}

function workspaceMemberWriteNotice(error: unknown): Notice {
  if (!(error instanceof WorkspaceMembersWriteError)) return 'failure'
  if (error.code === 'AG_RESOURCE_IN_USE') return 'last-admin'
  if (error.code === 'AG_DRAFT_REVISION_CONFLICT') return 'conflict'
  if (error.status === 403 || error.status === 404) return 'not-allowed'
  return 'failure'
}
