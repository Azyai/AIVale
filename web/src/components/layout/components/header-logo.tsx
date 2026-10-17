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
import nightLogo from '@/assets/logo-night.png'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

interface HeaderLogoProps {
  src: string
  alt?: string
  loading: boolean
  logoLoaded: boolean
  className?: string
}

/**
 * Brand orb rebuilt from the brand palette with CSS gradients (`.brand-orb`):
 * vector-crisp, transparent and identical on light and dark themes.
 */
export function BrandOrb(props: { className?: string }) {
  return (
    <span
      aria-hidden='true'
      className={cn('brand-orb shrink-0', props.className)}
    />
  )
}

/**
 * Header brand lockup: orb + 京西智库 wordmark (rendered as text so it follows
 * the theme foreground) + tagline. Pure markup — dark mode needs no second
 * asset and there is no raster background to leave residue.
 */
export function BrandLockup() {
  const { t } = useTranslation()
  return (
    <>
      <BrandOrb className='size-9 md:size-12' />
      <span className='flex min-w-0 flex-col gap-1 leading-none'>
        <span className='text-foreground truncate text-lg font-bold tracking-tight md:text-2xl'>
          京西智库
        </span>
        <span className='text-muted-foreground hidden truncate text-[10px] tracking-[0.28em] md:block md:text-[11px]'>
          {t('Token 服务 · 模型部署')}
        </span>
      </span>
    </>
  )
}

/**
 * Logo component for header with loading state
 * Shows image only when fully loaded for smooth UX
 */
export function HeaderLogo({
  src,
  alt = 'logo',
  loading,
  logoLoaded,
  className,
}: HeaderLogoProps) {
  return (
    <>
      <img
        src={src}
        alt={alt}
        className={cn(
          'h-6 w-6 rounded-full transition-opacity duration-200 dark:hidden',
          !loading && logoLoaded ? 'opacity-100' : 'opacity-0',
          className
        )}
      />
      <img
        src={nightLogo}
        alt={alt}
        className='hidden size-full object-contain dark:block'
      />
    </>
  )
}
