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
import { GitCompareArrows, X } from 'lucide-react'
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { MAX_COMPARE_MODELS, useCompareStore } from '../hooks/use-compare'
import type { PricingModel, TokenUnit } from '../types'
import { CompareDialog } from './compare-dialog'

export interface CompareBarProps {
  models: PricingModel[]
  tokenUnit?: TokenUnit
  priceRate?: number
  usdExchangeRate?: number
  showRechargePrice?: boolean
}

export const CompareBar = memo(function CompareBar(props: CompareBarProps) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const selected = useCompareStore((state) => state.selected)
  const remove = useCompareStore((state) => state.remove)
  const clear = useCompareStore((state) => state.clear)

  const selectedModels = useMemo(
    () =>
      selected
        .map(
          (name) =>
            props.models.find((model) => model.model_name === name) ?? null
        )
        .filter((model): model is PricingModel => model !== null),
    [selected, props.models]
  )

  const handleCompare = useCallback(() => {
    if (selectedModels.length < 2) {
      toast.info(t('Select at least 2 models to compare'))
      return
    }
    setDialogOpen(true)
  }, [selectedModels.length, t])

  if (selected.length === 0) {
    return null
  }

  return (
    <>
      <div
        role='region'
        aria-label={t('Compare models')}
        className='fixed bottom-6 left-1/2 z-40 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 sm:w-auto'
      >
        <div className='border-border/70 bg-card/90 flex flex-wrap items-center gap-2 rounded-full border p-2 pl-3 shadow-lg shadow-black/5 backdrop-blur-md'>
          <GitCompareArrows
            aria-hidden
            className='text-primary size-4 shrink-0'
          />
          <div className='flex min-w-0 flex-1 flex-wrap items-center gap-1.5'>
            {selectedModels.map((model) => {
              const iconKey = model.icon || model.vendor_icon
              const icon = iconKey ? getLobeIcon(iconKey, 14) : null
              return (
                <span
                  key={model.model_name}
                  className='bg-muted/60 flex max-w-[180px] items-center gap-1.5 rounded-full py-0.5 pr-1 pl-2.5'
                >
                  {icon}
                  <span
                    className='truncate font-mono text-xs font-medium'
                    title={model.model_name}
                  >
                    {model.model_name}
                  </span>
                  <button
                    type='button'
                    aria-label={t('Remove {{name}} from compare', {
                      name: model.model_name,
                    })}
                    onClick={() => remove(model.model_name)}
                    className='text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 cursor-pointer rounded-full p-0.5 transition-colors'
                  >
                    <X aria-hidden className='size-3' />
                  </button>
                </span>
              )
            })}
          </div>
          <div className='flex shrink-0 items-center gap-1.5'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={clear}
              className='text-muted-foreground h-8 rounded-full px-3 text-xs'
            >
              {t('Clear')}
            </Button>
            <Button
              type='button'
              size='sm'
              onClick={handleCompare}
              disabled={selectedModels.length < 2}
              className={cn('h-8 rounded-full px-4 text-xs font-medium')}
            >
              {t('Compare {{count}}', { count: selectedModels.length })}
            </Button>
          </div>
        </div>
        <p className='text-muted-foreground/70 sr-only'>
          {t('You can compare up to {{count}} models', {
            count: MAX_COMPARE_MODELS,
          })}
        </p>
      </div>

      <CompareDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        models={selectedModels}
        tokenUnit={props.tokenUnit}
        priceRate={props.priceRate}
        usdExchangeRate={props.usdExchangeRate}
        showRechargePrice={props.showRechargePrice}
      />
    </>
  )
})
