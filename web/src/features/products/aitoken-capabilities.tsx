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
  ApiIcon,
  ArrowRight01Icon,
  Layers01Icon,
  Shield01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { buttonVariants } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

const CAPABILITIES = [
  {
    id: 'access',
    titleKey: 'Model API access',
    descriptionKey:
      'Use a single gateway address to connect supported models. Keep keys, usage, and charges in the existing console.',
    icon: ApiIcon,
  },
  {
    id: 'keys',
    titleKey: 'API keys',
    descriptionKey: 'Create an API key in the console and store it securely.',
    icon: Shield01Icon,
  },
  {
    id: 'usage',
    titleKey: 'Usage and plans',
    descriptionKey:
      'Compare the plans configured for this site and use the existing wallet and subscription flows.',
    icon: Layers01Icon,
  },
] as const

export function AITokenCapabilities() {
  const { t } = useTranslation()

  return (
    <section
      id='capabilities'
      aria-labelledby='aitoken-capabilities-title'
      className='relative scroll-mt-24 px-5 py-12 sm:px-8 md:py-16 lg:px-12 2xl:px-16'
    >
      <div className='mb-8 text-center'>
        <h2
          id='aitoken-capabilities-title'
          className='text-[clamp(2rem,3.5vw,3rem)] leading-tight font-bold tracking-tight text-balance'
        >
          {t('Model access, keys, usage, and plans in one place.')}
        </h2>
        <p className='text-muted-foreground mx-auto mt-3 w-[90%] text-base leading-relaxed md:text-lg'>
          {t('Compatible API routes for common AI application workflows')}
        </p>
      </div>

      <Tabs
        defaultValue='access'
        orientation='vertical'
        className='flex-col gap-8 rounded-3xl bg-linear-to-br from-blue-500/10 via-violet-500/5 to-cyan-400/5 p-5 sm:p-6 md:flex-row md:items-stretch md:gap-12 md:p-10'
      >
        <TabsList
          variant='line'
          className='h-auto w-full items-stretch justify-start gap-0 p-0 md:w-2/5 md:justify-between'
        >
          {CAPABILITIES.map((capability) => (
            <TabsTrigger
              key={capability.id}
              value={capability.id}
              aria-label={t(capability.titleKey)}
              aria-describedby={`aitoken-tab-description-${capability.id}`}
              className='group/aitoken-tab border-border/50 data-active:text-foreground text-muted-foreground/70 hover:text-foreground block h-auto w-full flex-none rounded-none border-0 border-b bg-transparent px-0 py-4 text-left whitespace-normal after:hidden last:border-b-0 data-active:bg-transparent md:py-5 dark:data-active:bg-transparent'
            >
              <span className='flex w-full items-start gap-3'>
                <span
                  aria-hidden='true'
                  className='bg-border group-data-active/aitoken-tab:bg-primary group-data-active/aitoken-tab:shadow-primary/30 mt-1 h-6 w-1 shrink-0 rounded-full group-data-active/aitoken-tab:shadow-sm'
                />
                <span className='min-w-0 flex-1'>
                  <span className='block text-xl font-semibold tracking-tight md:text-2xl'>
                    {t(capability.titleKey)}
                  </span>
                  <span
                    id={`aitoken-tab-description-${capability.id}`}
                    className='text-muted-foreground mt-3 hidden text-base leading-relaxed font-normal group-data-active/aitoken-tab:block md:text-lg'
                  >
                    {t(capability.descriptionKey)}
                  </span>
                </span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        <div className='grid min-w-0 flex-1'>
          {CAPABILITIES.map((capability) => (
            <TabsContent
              key={capability.id}
              value={capability.id}
              className='border-border/60 bg-card/80 col-start-1 row-start-1 flex h-[34rem] w-full flex-col justify-center overflow-y-auto rounded-2xl border p-5 shadow-sm backdrop-blur-sm sm:p-6 md:h-[29rem] md:p-7'
            >
              <h3 className='sr-only'>{t(capability.titleKey)}</h3>
              {capability.id === 'access' && <AccessPreview />}
              {capability.id === 'keys' && <KeysPreview />}
              {capability.id === 'usage' && <UsagePreview />}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </section>
  )
}

function AccessPreview() {
  const { t } = useTranslation()

  return (
    <div className='space-y-5'>
      <div className='grid grid-cols-3 gap-3'>
        {['OpenAI', 'Claude', 'Gemini'].map((provider) => (
          <div
            key={provider}
            className='border-primary/15 bg-background/80 flex min-w-0 flex-col items-center gap-3 rounded-xl border px-2 py-5 shadow-sm'
          >
            <span aria-hidden='true'>{getLobeIcon(provider, 32)}</span>
            <span className='text-center text-xs font-medium sm:text-sm'>
              {provider}
            </span>
          </div>
        ))}
      </div>
      <div className='border-primary/15 bg-background/85 divide-primary/10 divide-y overflow-hidden rounded-xl border font-mono text-xs sm:text-sm'>
        {[
          ['base_url', '$AIVALE_BASE_URL/v1'],
          ['api_key', '$AIVALE_API_KEY'],
          ['model', 'YOUR_MODEL_ID'],
        ].map(([key, value]) => (
          <div
            key={key}
            className='grid grid-cols-[5rem_1fr] gap-2 px-4 py-3 sm:grid-cols-[6rem_1fr]'
          >
            <span className='text-muted-foreground'>{key}</span>
            <span className='text-primary min-w-0 break-all'>{value}</span>
          </div>
        ))}
      </div>
      <p className='text-muted-foreground text-xs leading-relaxed'>
        {t(
          'Model availability and supported routes depend on your account and the configured channels.'
        )}
      </p>
    </div>
  )
}

function KeysPreview() {
  const { t } = useTranslation()

  return (
    <div className='space-y-5'>
      <div className='grid grid-cols-2 gap-3'>
        {['Personal', 'Team'].map((label) => (
          <div
            key={label}
            className='border-primary/15 bg-background/80 rounded-xl border p-5'
          >
            <HugeiconsIcon
              icon={Shield01Icon}
              className='text-primary mb-4 size-7'
              aria-hidden='true'
            />
            <p className='font-semibold'>{t(label)}</p>
            <p className='text-muted-foreground mt-2 text-xs'>
              {t('API keys')}
            </p>
          </div>
        ))}
      </div>
      <div className='flex items-center gap-4 rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-5'>
        <HugeiconsIcon
          icon={Shield01Icon}
          className='size-7 shrink-0 text-cyan-700 dark:text-cyan-300'
          aria-hidden='true'
        />
        <div className='min-w-0'>
          <p className='font-medium'>{t('Authentication')}</p>
          <code className='text-muted-foreground mt-1 block text-xs break-all'>
            Authorization: Bearer $AIVALE_API_KEY
          </code>
        </div>
      </div>
      <p className='text-muted-foreground text-xs leading-relaxed'>
        {t('Create an API key in the console and store it securely.')}
      </p>
    </div>
  )
}

function UsagePreview() {
  const { t } = useTranslation()

  return (
    <div className='space-y-5'>
      <div className='grid grid-cols-3 items-center gap-3'>
        {['Request', 'Usage', 'Usage and billing'].map((label, index) => (
          <div
            key={label}
            className='border-primary/15 bg-background/80 relative flex min-h-28 flex-col justify-center rounded-xl border p-3 text-center'
          >
            <span className='text-primary/50 mb-2 font-mono text-xs'>
              0{index + 1}
            </span>
            <span className='text-xs font-medium sm:text-sm'>{t(label)}</span>
          </div>
        ))}
      </div>
      <div className='grid gap-4 rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-5 sm:grid-cols-2'>
        <div>
          <p className='font-semibold'>{t('Wallet')}</p>
          <p className='text-muted-foreground mt-2 text-xs leading-relaxed'>
            {t('After the request, check usage and charges in the console.')}
          </p>
        </div>
        <div className='border-t border-cyan-400/20 pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5'>
          <p className='font-semibold'>{t('Subscriptions')}</p>
          <p className='text-muted-foreground mt-2 text-xs leading-relaxed'>
            {t(
              "Plans, quotas, and prices are determined by this site's configuration."
            )}
          </p>
        </div>
      </div>
      <p className='text-muted-foreground text-xs leading-relaxed'>
        {t(
          'Team plans are billed per seat and share one quota pool across team tokens.'
        )}
      </p>
    </div>
  )
}

const CLIENTS = [
  { name: 'Cherry Studio', icon: 'CherryStudio' },
  { name: 'Cline', icon: 'Cline' },
  { name: 'Cursor', icon: 'Cursor' },
  { name: 'LobeChat', icon: 'LobeHub' },
  { name: 'Dify', icon: 'Dify' },
  { name: 'Open WebUI', icon: 'OpenWebUI' },
] as const

export function AITokenClients() {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='aitoken-clients-title'
      className='border-primary/10 via-background border-y bg-linear-to-r from-violet-500/5 to-cyan-400/5 px-5 py-12 sm:px-8 md:py-16 lg:px-12 2xl:px-16'
    >
      <div className='flex flex-col justify-between gap-5 lg:flex-row lg:items-end'>
        <div>
          <h2
            id='aitoken-clients-title'
            className='text-2xl font-semibold tracking-tight sm:text-3xl'
          >
            {t('Works with your favorite tools')}
          </h2>
          <p className='text-muted-foreground mt-3 max-w-3xl text-base leading-relaxed'>
            {t('Configure a compatible API address and key in your client.')}
          </p>
        </div>
        <Link
          to='/products/$productId'
          params={{ productId: 'model-library' }}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'border-primary/20 h-auto min-h-11 w-fit max-w-full px-4 py-2 whitespace-normal'
          )}
        >
          {t('Model library')}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            data-icon='inline-end'
            aria-hidden='true'
          />
        </Link>
      </div>
      <ul className='mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6'>
        {CLIENTS.map((client) => (
          <li
            key={client.name}
            className='border-primary/15 bg-background/75 flex min-h-32 flex-col items-center justify-center gap-4 rounded-xl border px-3 py-6'
          >
            <span aria-hidden='true'>{getLobeIcon(client.icon, 36)}</span>
            <span className='text-center text-sm font-medium'>
              {client.name}
            </span>
          </li>
        ))}
      </ul>
      <p className='text-muted-foreground mt-5 text-sm leading-relaxed'>
        {t(
          'Client compatibility depends on the protocol and features supported by that client.'
        )}
      </p>
    </section>
  )
}
