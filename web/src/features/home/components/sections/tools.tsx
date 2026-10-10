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

import { getLobeIcon } from '@/lib/lobe-icon'

import { SUPPORTED_TOOLS } from '../../constants'

export function ToolsWall() {
  const { t } = useTranslation()

  return (
    <section className='px-[5%] py-12 md:py-16'>
      <div className='mx-auto w-full'>
        <div className='mb-10 text-center'>
          <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
            {t('Works with the tools you already use')}
          </h2>
          <p className='text-muted-foreground/70 mt-3 text-sm md:text-base'>
            {t(
              'OpenAI-compatible endpoint — configure once and every client just works.'
            )}
          </p>
        </div>

        <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-5 lg:grid-cols-5'>
          {SUPPORTED_TOOLS.map((tool) => (
            <div
              key={tool.label}
              className='border-border/60 bg-card/60 flex items-center gap-3.5 rounded-2xl border p-5 transition-all duration-300 hover:shadow-sm'
            >
              <div className='flex size-10 shrink-0 items-center justify-center'>
                {getLobeIcon(tool.icon, 30)}
              </div>
              <span className='truncate text-[15px] font-medium'>
                {tool.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
