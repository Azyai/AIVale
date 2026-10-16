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
import { toast } from 'sonner'

import { StatusBadge } from '@/components/status-badge'
import { Switch } from '@/components/ui/switch'
import { handleServerError } from '@/lib/handle-server-error'

import { updateApiKeyStatus } from '../api'
import {
  API_KEY_STATUS,
  API_KEY_STATUSES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from '../constants'
import type { ApiKey } from '../types'
import { useApiKeys } from './api-keys-provider'

export function ApiKeyStatusSwitch({ apiKey }: { apiKey: ApiKey }) {
  const { t } = useTranslation()
  const { triggerRefresh } = useApiKeys()
  const [pending, setPending] = useState(false)

  // 过期/耗尽是终态，只能显示徽标，不能再用开关切换
  const terminal =
    apiKey.status === API_KEY_STATUS.EXPIRED ||
    apiKey.status === API_KEY_STATUS.EXHAUSTED
  if (terminal) {
    const config = API_KEY_STATUSES[apiKey.status]
    return (
      <StatusBadge
        label={t(config.label)}
        variant={config.variant}
        copyable={false}
        className='px-0 text-xs font-normal'
      />
    )
  }

  const isEnabled = apiKey.status === API_KEY_STATUS.ENABLED

  const handleCheckedChange = async (checked: boolean) => {
    const nextStatus = checked
      ? API_KEY_STATUS.ENABLED
      : API_KEY_STATUS.DISABLED
    setPending(true)
    try {
      const result = await updateApiKeyStatus(apiKey.id, nextStatus)
      if (result.success) {
        toast.success(
          checked
            ? t(SUCCESS_MESSAGES.API_KEY_ENABLED)
            : t(SUCCESS_MESSAGES.API_KEY_DISABLED)
        )
        triggerRefresh()
      } else {
        handleServerError(result, t(ERROR_MESSAGES.STATUS_UPDATE_FAILED))
      }
    } catch (error) {
      handleServerError(error, t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setPending(false)
    }
  }

  return (
    <Switch
      checked={isEnabled}
      disabled={pending}
      onCheckedChange={handleCheckedChange}
      aria-label={t('Toggle status')}
    />
  )
}
