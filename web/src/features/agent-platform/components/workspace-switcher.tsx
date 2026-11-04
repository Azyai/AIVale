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
import { ChevronsUpDown, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

import {
  defaultWorkspaceListSearch,
  type WorkspaceListSearch,
} from '../lib/workspace-list-search'
import { WorkspaceListContent } from './workspace-list'

const defaultSwitcherSearch = { ...defaultWorkspaceListSearch, page_size: 10 }

export function WorkspaceSwitcher(props: {
  returnSearch: WorkspaceListSearch
  verified: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState<WorkspaceListSearch>(
    defaultSwitcherSearch
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) setSearch(defaultSwitcherSearch)
      }}
    >
      <DialogTrigger
        disabled={!props.verified}
        render={<Button variant='outline' />}
      >
        <ChevronsUpDown aria-hidden='true' />
        {t('Switch workspace')}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className='sm:max-w-3xl'>
        <DialogHeader className='pr-9'>
          <DialogTitle>{t('Switch workspace')}</DialogTitle>
          <DialogDescription>
            {t('Choose a workspace you can access.')}
          </DialogDescription>
        </DialogHeader>
        <DialogClose
          aria-label={t('Close')}
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              className='absolute top-2 right-2'
            />
          }
        >
          <X aria-hidden='true' />
        </DialogClose>
        {open &&
          (props.verified ? (
            <WorkspaceListContent
              search={search}
              onSearchChange={setSearch}
              returnSearch={props.returnSearch}
              onWorkspaceSelect={() => setOpen(false)}
            />
          ) : (
            <div role='status'>
              <LoadingState message={t('Loading workspace...')} />
            </div>
          ))}
      </DialogContent>
    </Dialog>
  )
}
