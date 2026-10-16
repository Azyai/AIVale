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

import { ApiKeysBaseUrl } from './components/api-keys-base-url'
import { ApiKeysDialogs } from './components/api-keys-dialogs'
import { ApiKeysProvider } from './components/api-keys-provider'
import { ApiKeysTable } from './components/api-keys-table'
import { TokenPlanSection } from './components/token-plan-section'

export function ApiKeys() {
  const { t } = useTranslation()

  return (
    <ApiKeysProvider>
      <div className='mx-auto w-full max-w-[1116px] space-y-10 px-4 py-8 sm:px-6'>
        {/* 页头 */}
        <header className='space-y-2'>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t('API Keys')}
          </h1>
          <p className='text-muted-foreground text-sm'>
            {t('集中管理您的访问凭证，用于模型调用身份鉴权')}
          </p>
        </header>

        {/* Token Plan 区块 */}
        <TokenPlanSection />

        {/* 按量付费区块（无标题，直接 Base URL + 密钥列表） */}
        <section className='space-y-6'>
          <ApiKeysBaseUrl />

          <ApiKeysTable />
        </section>
      </div>

      <ApiKeysDialogs />
    </ApiKeysProvider>
  )
}
