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
import { ArrowDownRight, ArrowRight, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  BUSINESS_AREAS,
  PRODUCT_GROUPS,
  RELEASE_STAGE_LABEL_KEYS,
  type CatalogLink,
  type CatalogProduct,
} from '@/features/platform-catalog'
import { cn } from '@/lib/utils'

type CatalogNavLinkProps = {
  link: CatalogLink
  className?: string
  onSelect: () => void
}

export function CatalogNavLink(props: CatalogNavLinkProps) {
  const { t } = useTranslation()
  const className = cn(
    'hover:text-foreground focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none',
    props.className
  )
  const title = t(props.link.titleKey)

  if (props.link.external) {
    return (
      <a
        href={props.link.href}
        target='_blank'
        rel='noopener noreferrer'
        className={className}
        onClick={props.onSelect}
      >
        {title}
        <ExternalLink className='size-3.5 shrink-0' aria-hidden />
      </a>
    )
  }

  return (
    <Link
      to={props.link.href}
      hash={props.link.hash}
      activeOptions={{ exact: true, includeSearch: false }}
      className={className}
      onClick={props.onSelect}
    >
      {title}
    </Link>
  )
}

const sectionLinkClassName =
  'text-primary hover:text-primary/80 focus-visible:ring-ring inline-flex min-h-11 w-fit items-center gap-2 rounded-sm text-sm font-medium focus-visible:ring-2 focus-visible:outline-none'

export function ProductMenuContent(props: {
  products: readonly CatalogProduct[]
  onSelect: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className='divide-border divide-y'>
      {PRODUCT_GROUPS.map((group) => {
        const products = props.products.filter(
          (product) => product.group === group.id
        )
        if (products.length === 0) return null

        return (
          <section
            key={group.id}
            className='grid gap-2 px-1 py-3 lg:grid-cols-[10.5rem_1fr] lg:gap-3 lg:px-4 lg:py-4'
          >
            <h2 className='text-muted-foreground px-2 text-sm font-medium lg:pt-2'>
              {t(group.titleKey)}
            </h2>
            <ul className='grid gap-1 lg:grid-cols-2'>
              {products.map((product) => (
                <li key={product.id} className='min-w-0 px-2'>
                  <Link
                    to='/products/$productId'
                    params={{ productId: product.id }}
                    onClick={props.onSelect}
                    className='hover:bg-muted focus-visible:ring-ring -mx-2 block rounded-md p-2 focus-visible:ring-2 focus-visible:outline-none'
                  >
                    <span className='flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold'>
                      {t(product.titleKey)}
                      {product.releaseStage !== 'available' && (
                        <Badge variant='outline'>
                          {t(RELEASE_STAGE_LABEL_KEYS[product.releaseStage])}
                        </Badge>
                      )}
                    </span>
                    <span className='text-muted-foreground mt-1 block text-sm leading-snug'>
                      {t(product.descriptionKey)}
                    </span>
                  </Link>
                  {product.operation && (
                    <CatalogNavLink
                      link={product.operation}
                      className='text-primary inline-flex min-h-11 items-center gap-1 text-sm font-medium lg:min-h-8'
                      onSelect={props.onSelect}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      <div className='px-3 lg:px-6'>
        <Link
          to='/products'
          className={sectionLinkClassName}
          onClick={props.onSelect}
        >
          {t('View all products')}
          <ArrowRight className='size-4' aria-hidden />
        </Link>
      </div>
    </div>
  )
}

export function BusinessMenuContent(props: { onSelect: () => void }) {
  const { t } = useTranslation()

  return (
    <div className='px-3 pt-2 lg:px-4'>
      <ul className='divide-border grid divide-y'>
        {BUSINESS_AREAS.map((area) => (
          <li key={area.id} className='py-2.5'>
            <div className='flex flex-wrap items-center gap-2 font-medium'>
              {t(area.titleKey)}
              <Badge variant='outline'>{t('Planned')}</Badge>
            </div>
            <p className='text-muted-foreground mt-1 text-sm leading-snug'>
              {t(area.descriptionKey)}
            </p>
          </li>
        ))}
      </ul>
      <Link
        to='/business'
        className={sectionLinkClassName}
        onClick={props.onSelect}
      >
        {t('About the Business Hall')}
        <ArrowRight className='size-4' aria-hidden />
      </Link>
    </div>
  )
}

export function DeveloperMenuContent(props: {
  links: readonly CatalogLink[]
  onSelect: () => void
}) {
  return (
    <ul className='p-1'>
      {props.links.map((link) => (
        <li key={link.id}>
          <CatalogNavLink
            link={link}
            className='hover:bg-muted flex min-h-11 items-center gap-2 rounded-md px-3'
            onSelect={props.onSelect}
          />
        </li>
      ))}
    </ul>
  )
}

export function CatalogSearch(props: {
  products: readonly CatalogProduct[]
  docs: readonly CatalogLink[]
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const term = query.normalize('NFKC').trim().toLowerCase()
  const results = props.products
    .filter((product) =>
      [
        t(product.titleKey),
        t(product.descriptionKey),
        product.titleKey,
        ...product.aliases,
      ].some((value) => value.normalize('NFKC').toLowerCase().includes(term))
    )
    .map<CatalogLink>((product) => ({
      id: product.id,
      href: product.overviewHref,
      titleKey: product.titleKey,
    }))

  for (const link of props.docs) {
    if (
      [t(link.titleKey), link.titleKey].some((value) =>
        value.toLowerCase().includes(term)
      )
    ) {
      results.push(link)
    }
  }

  return (
    <div className='space-y-2 p-2'>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        type='search'
        aria-label={t('Search products and docs')}
        placeholder={t('Search products and docs')}
        className='min-h-11'
      />
      <ul className='max-h-64 space-y-1 overflow-y-auto'>
        {results.map((link) => (
          <li key={link.id} className='flex items-center gap-2'>
            <ArrowDownRight
              className='text-muted-foreground ms-2 size-4 shrink-0'
              aria-hidden
            />
            <CatalogNavLink
              link={link}
              className='hover:bg-muted flex min-h-11 flex-1 items-center gap-2 rounded-md px-2 font-medium'
              onSelect={props.onSelect}
            />
          </li>
        ))}
      </ul>
      {results.length === 0 && (
        <p role='status' className='text-muted-foreground px-2 pb-2 text-sm'>
          {t('No matching products or docs.')}
        </p>
      )}
    </div>
  )
}
