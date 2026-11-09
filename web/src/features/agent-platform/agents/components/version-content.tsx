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
import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { WorkspaceWriteSession } from '../../lib/workspace-write-transport'
import { usePrivateAgentQuery } from '../queries'
import { getAgentVersion } from '../release-api'
import { compareAgentConfigurations } from '../release-diff'
import type { AgentVersionDetail } from '../release-schemas'

export function AgentVersionContent(props: {
  workspaceId: string
  agentId: string
  session: WorkspaceWriteSession
  selectedVersion: string
  compareVersion?: string
  verified: boolean
  onAccessLost: () => void
  actions?: (version: AgentVersionDetail, verified: boolean) => ReactNode
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const selected = usePrivateAgentQuery(
    ['version', props.workspaceId, props.agentId, props.selectedVersion],
    props.session,
    props.verified,
    (signal) =>
      getAgentVersion(
        props.workspaceId,
        props.agentId,
        props.selectedVersion,
        signal
      )
  )
  const compared = usePrivateAgentQuery(
    ['version', props.workspaceId, props.agentId, props.compareVersion],
    props.session,
    props.verified && Boolean(props.compareVersion),
    (signal) =>
      getAgentVersion(
        props.workspaceId,
        props.agentId,
        props.compareVersion ?? props.selectedVersion,
        signal
      )
  )
  const unavailable =
    selected.data?.kind === 'unavailable' ||
    (Boolean(props.compareVersion) && compared.data?.kind === 'unavailable')
  const { onAccessLost } = props
  useEffect(() => {
    if (unavailable) onAccessLost()
  }, [unavailable, onAccessLost])
  if (unavailable) return null
  const cached =
    selected.data?.kind === 'ready' ? selected.data.data : undefined
  const actionsReady =
    props.verified &&
    selected.fetchStatus === 'idle' &&
    selected.isFetchedAfterMount &&
    !selected.isError &&
    (!props.compareVersion ||
      (compared.fetchStatus === 'idle' &&
        compared.isFetchedAfterMount &&
        !compared.isError))
  const renderContent = () => {
    if (!props.verified) return null
    if (selected.isError || (props.compareVersion && compared.isError)) {
      return (
        <ErrorState
          title={t('Unable to load version content')}
          onRetry={() => {
            void selected.refetch()
            if (props.compareVersion) void compared.refetch()
          }}
        />
      )
    }
    const first =
      selected.fetchStatus === 'idle' &&
      selected.isFetchedAfterMount &&
      selected.data?.kind === 'ready'
        ? selected.data.data
        : undefined
    const second =
      compared.fetchStatus === 'idle' &&
      compared.isFetchedAfterMount &&
      compared.data?.kind === 'ready'
        ? compared.data.data
        : undefined
    if (!first || (props.compareVersion && !second)) {
      return <LoadingState message={t('Loading version content...')} />
    }
    const difference = second
      ? compareAgentConfigurations(first.config, second.config)
      : undefined
    const text = JSON.stringify(first.config, null, 2)
    return (
      <section
        className='mt-6 min-w-0 border-t pt-6'
        aria-label={t('Version content')}
      >
        <h3 className='text-lg font-semibold'>
          {t('Version {{version}}', {
            version: formatNumber(first.version_no, locale),
          })}
        </h3>
        <p className='text-muted-foreground mt-2 text-sm'>
          {t(
            'This immutable snapshot passed structural and hash verification when read. Model availability and current publication policy are not checked here.'
          )}
        </p>
        <dl className='mt-4 grid min-w-0 gap-2 text-sm'>
          <dt className='font-medium'>{t('Configuration hash')}</dt>
          <dd className='font-mono text-xs [overflow-wrap:anywhere]'>
            {first.config_hash}
          </dd>
          <dt className='font-medium'>{t('Release note')}</dt>
          <dd className='[overflow-wrap:anywhere] whitespace-pre-wrap'>
            {first.release_note || t('No release note')}
          </dd>
        </dl>
        {difference && second && (
          <section
            className='mt-5 min-w-0'
            aria-label={t('Version comparison')}
          >
            <h4 className='font-medium'>
              {t('Compare version {{before}} with {{after}}', {
                before: formatNumber(first.version_no, locale),
                after: formatNumber(second.version_no, locale),
              })}
            </h4>
            {(difference.modelChanged || difference.budgetIncreased) && (
              <Alert className='mt-3'>
                <AlertDescription>
                  {difference.modelChanged && (
                    <p>{t('The selected model changes.')}</p>
                  )}
                  {difference.budgetIncreased && (
                    <p>{t('The budget limit increases.')}</p>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <div className='mt-3 divide-y'>
              {difference.groups.map((group) => (
                <section key={group.field} className='min-w-0 py-4'>
                  <h5 className='flex items-center gap-2 font-medium'>
                    {t(group.labelKey)}
                    {group.changed && (
                      <Badge variant='secondary'>{t('Changed')}</Badge>
                    )}
                  </h5>
                  <div className='mt-2 grid min-w-0 gap-3 lg:grid-cols-2'>
                    <div className='min-w-0'>
                      <p className='text-muted-foreground mb-2 text-xs'>
                        {t('Version {{version}}', {
                          version: formatNumber(first.version_no, locale),
                        })}
                      </p>
                      <pre
                        tabIndex={0}
                        className='bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs [overflow-wrap:anywhere] whitespace-pre-wrap'
                      >
                        {group.before}
                      </pre>
                    </div>
                    <div className='min-w-0'>
                      <p className='text-muted-foreground mb-2 text-xs'>
                        {t('Version {{version}}', {
                          version: formatNumber(second.version_no, locale),
                        })}
                      </p>
                      <pre
                        tabIndex={0}
                        className='bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs [overflow-wrap:anywhere] whitespace-pre-wrap'
                      >
                        {group.after}
                      </pre>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </section>
        )}
        {!difference && (
          <>
            <div className='mt-5 flex items-center justify-between gap-3'>
              <h4 className='font-medium'>{t('Configuration')}</h4>
              <CopyButton value={text} aria-label={t('Copy configuration')} />
            </div>
            <pre
              tabIndex={0}
              className='bg-muted mt-2 max-h-[32rem] overflow-auto rounded-md p-4 text-xs [overflow-wrap:anywhere] whitespace-pre-wrap'
            >
              {text}
            </pre>
          </>
        )}
      </section>
    )
  }
  return (
    <>
      {cached && (
        <div hidden={!actionsReady} inert={!actionsReady}>
          {props.actions?.(cached, actionsReady)}
        </div>
      )}
      {renderContent()}
    </>
  )
}
