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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'
import { SHOW_SYSTEM_LOGO } from '@/lib/constants'

type AuthLayoutProps = {
  children: React.ReactNode
}

const brandStats = [
  { value: 'Multi-model', label: 'Unified access' },
  { value: 'Instant', label: 'Elastic scaling' },
  { value: '99.9%', label: 'Service availability' },
  { value: 'End-to-end', label: 'Usage auditing' },
]

function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|webm)(?:\?|$)/i.test(url)
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const {
    systemName,
    logo,
    loading,
    loginPanelTitle,
    loginPanelDescription,
    loginPanelMedia,
    loginPanelTags,
  } = useSystemConfig()
  const year = new Date().getFullYear()
  const customTitle = loginPanelTitle?.trim() || ''
  const customDescription = loginPanelDescription?.trim() || ''
  const mediaUrl = loginPanelMedia?.trim() || ''
  const tagList = (loginPanelTags ?? '')
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)

  const brandMark = (
    <Link
      to='/'
      className='flex items-center gap-2 transition-opacity hover:opacity-80'
    >
      {SHOW_SYSTEM_LOGO && (
        <div className='relative h-8 w-8'>
          {loading ? (
            <Skeleton className='absolute inset-0 rounded-full' />
          ) : (
            <img
              src={logo}
              alt={t('Logo')}
              className='h-8 w-8 object-contain'
            />
          )}
        </div>
      )}
      {loading ? (
        <Skeleton className='h-6 w-24' />
      ) : (
        <h1 className='text-xl font-medium'>{systemName}</h1>
      )}
    </Link>
  )

  return (
    <div className='flex h-svh max-w-none'>
      {/* Brand panel: hidden below lg, mirrors the split login screen layout.
          The admin-uploaded media renders as one large borderless rounded card
          (~90% of the panel, inset 5%) acting as the background layer. The
          content column shares the same inset and keeps a fixed 32-40px
          padding inside the card, so text never hugs the card or screen
          edges and the gap scales proportionally at large resolutions. */}
      <div className='relative hidden w-[62%] flex-col lg:flex'>
        {mediaUrl && (
          <div className='absolute inset-[5%] z-0 overflow-hidden rounded-3xl shadow-[0_12px_48px_rgba(0,0,0,0.10)]'>
            {isVideoMediaUrl(mediaUrl) ? (
              <video
                src={mediaUrl}
                autoPlay
                muted
                loop
                playsInline
                className='h-full w-full object-cover'
              />
            ) : (
              <img
                src={mediaUrl}
                alt=''
                className='h-full w-full object-cover'
              />
            )}
          </div>
        )}
        <div className='absolute inset-[5%] flex flex-col gap-8 p-8 xl:p-10'>
          <div className='relative z-10'>{brandMark}</div>
          <div className='relative z-10 mt-auto space-y-2.5'>
            {customTitle ? (
              <h2 className='max-w-xl text-4xl leading-tight font-semibold tracking-tight text-balance whitespace-pre-line xl:text-[44px]'>
                {customTitle}
              </h2>
            ) : (
              <h2 className='max-w-xl text-4xl leading-tight font-semibold tracking-tight text-balance xl:text-[44px]'>
                {t('Unified access to large models')}
                <br />
                {t('Intelligent services, on demand')}
              </h2>
            )}
            {customDescription && (
              <p className='text-muted-foreground max-w-xl text-base whitespace-pre-line'>
                {customDescription}
              </p>
            )}
            <div className='mt-5 flex flex-wrap gap-8 xl:gap-10'>
              {tagList.length > 0
                ? tagList.map((tag) => {
                    const separator = tag.indexOf(' ')
                    const value = separator > 0 ? tag.slice(0, separator) : tag
                    const label =
                      separator > 0 ? tag.slice(separator + 1).trim() : ''
                    return (
                      <div key={tag} className='flex flex-col gap-0.5'>
                        <span className='text-lg font-semibold'>{value}</span>
                        {label && (
                          <span className='text-muted-foreground text-sm'>
                            {label}
                          </span>
                        )}
                      </div>
                    )
                  })
                : brandStats.map(({ value, label }) => (
                    <div key={label} className='flex flex-col gap-0.5'>
                      <span className='text-lg font-semibold'>{t(value)}</span>
                      <span className='text-muted-foreground text-sm'>
                        {t(label)}
                      </span>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className='relative flex h-full min-h-0 w-full flex-col lg:flex-1'>
        <div className='absolute top-4 left-4 z-10 sm:top-6 sm:left-6 lg:hidden'>
          {brandMark}
        </div>
        <div className='flex-1 overflow-y-auto'>
          <div className='mx-auto flex min-h-full w-full max-w-sm items-center justify-center px-4 py-16 sm:px-6 lg:py-12'>
            <div className='w-full space-y-2'>{children}</div>
          </div>
        </div>
        <div className='text-muted-foreground px-4 pb-6 text-center text-xs'>
          © {year} {systemName} · {t('footer.defaultCopyright')}
        </div>
      </div>
    </div>
  )
}
