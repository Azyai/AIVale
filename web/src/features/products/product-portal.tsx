import {
  AiBrain01Icon,
  ApiIcon,
  ArrowRight01Icon,
  Database01Icon,
  Layers01Icon,
  WorkflowSquare01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { Badge } from '@/components/ui/badge'
import {
  RELEASE_STAGE_LABEL_KEYS,
  type ProductDefinition,
} from '@/features/platform-catalog'
import { cn } from '@/lib/utils'

const productIcons = {
  aitoken: ApiIcon,
  'model-library': Layers01Icon,
  workbench: AiBrain01Icon,
  'agent-scheduling': WorkflowSquare01Icon,
  datasets: Database01Icon,
}

export function ProductPortal(props: {
  children: ReactNode
  fullBleed?: boolean
}) {
  return (
    <PublicLayout showMainContainer={false}>
      <main
        className={cn(
          'from-primary/8 via-background to-background min-h-svh w-full bg-linear-to-br',
          !props.fullBleed &&
            'px-5 pt-24 pb-12 sm:px-8 lg:px-12 lg:pt-28 lg:pb-16 2xl:px-16'
        )}
      >
        {props.children}
      </main>
      <Footer />
    </PublicLayout>
  )
}

export function ProductIcon(props: { id: ProductDefinition['id'] }) {
  return (
    <span className='bg-primary/8 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg'>
      <HugeiconsIcon
        icon={productIcons[props.id]}
        className='size-5'
        aria-hidden='true'
      />
    </span>
  )
}

export function ProductStage(props: {
  stage: keyof typeof RELEASE_STAGE_LABEL_KEYS
}) {
  const { t } = useTranslation()

  return (
    <Badge
      variant={props.stage === 'available' ? 'secondary' : 'outline'}
      className='h-auto min-h-5 whitespace-normal'
    >
      {t(RELEASE_STAGE_LABEL_KEYS[props.stage])}
    </Badge>
  )
}

export function ProductArrow() {
  return (
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      className='size-4'
      aria-hidden='true'
    />
  )
}
