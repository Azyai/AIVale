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
import { ArrowUpDown, Check, Filter } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PillTabs } from '@/components/pill-tabs'
import { DataTableViewModeToggle } from '@/components/data-table'
import {
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import { getSortLabels, type SortOption, type ViewMode } from '../constants'
import type { PricingModel, PricingVendor, TokenUnit } from '../types'
import { PricingSidebar } from './pricing-sidebar'
import { SearchBar } from './search-bar'

export interface PricingToolbarProps {
  filteredCount: number
  totalCount?: number
  sortBy: string
  onSortChange: (value: string) => void
  tokenUnit: TokenUnit
  onTokenUnitChange: (value: TokenUnit) => void
  showRechargePrice: boolean
  onRechargePriceChange: (value: boolean) => void
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
  quotaTypeFilter: string
  endpointTypeFilter: string
  vendorFilter: string
  groupFilter: string
  tagFilter: string
  onQuotaTypeChange: (value: string) => void
  onEndpointTypeChange: (value: string) => void
  onVendorChange: (value: string) => void
  onGroupChange: (value: string) => void
  onTagChange: (value: string) => void
  priceRange?: [number, number]
  onPriceRangeChange: (range: [number, number] | undefined) => void
  freeOnly: boolean
  onFreeOnlyChange: (freeOnly: boolean) => void
  searchInput: string
  onSearchChange: (value: string) => void
  onSearchClear: () => void
  vendors: PricingVendor[]
  groups: string[]
  groupRatios?: Record<string, number>
  tags: string[]
  models: PricingModel[]
  hasActiveFilters: boolean
  activeFilterCount: number
  onClearFilters: () => void
}

export function PricingToolbar(props: PricingToolbarProps) {
  const { t } = useTranslation()
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const sortLabels = getSortLabels(t)

  return (
    <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5'>
      <div className='flex items-center gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => setMobileFiltersOpen(true)}
          className='h-9 gap-1.5 rounded-full px-4 text-xs xl:hidden'
        >
          <Filter className='size-3.5' />
          {t('Filter')}
          {props.activeFilterCount > 0 && (
            <Badge className='ml-0.5 size-5 justify-center p-0 text-[10px]'>
              {props.activeFilterCount}
            </Badge>
          )}
        </Button>

        <h2 className='flex items-baseline gap-2 text-lg font-semibold'>
          {t('Models')}
          <span className='flex items-baseline gap-1.5 text-xs font-normal'>
            <span className='text-foreground tabular-nums'>
              {props.filteredCount.toLocaleString()}
            </span>
            <span className='text-muted-foreground'>
              {props.totalCount != null &&
              props.filteredCount !== props.totalCount
                ? `/ ${props.totalCount.toLocaleString()}`
                : t('models')}
            </span>
          </span>
        </h2>
      </div>

      <div className='flex min-w-0 flex-wrap items-center gap-2'>
        <SearchBar
          value={props.searchInput}
          onChange={props.onSearchChange}
          onClear={props.onSearchClear}
          placeholder={t(
            'Search model name, provider, endpoint, or tag...'
          )}
          className='w-44 sm:w-56'
        />

        <PillTabs
          size='sm'
          aria-label={t('Price display mode')}
          options={[
            { value: 'standard', label: t('Standard') },
            { value: 'recharge', label: t('Recharge') },
          ]}
          value={props.showRechargePrice ? 'recharge' : 'standard'}
          onChange={(v) => props.onRechargePriceChange(v === 'recharge')}
        />
        <PillTabs
          size='sm'
          aria-label={t('Token unit')}
          options={[
            { value: 'M', label: '/1M' },
            { value: 'K', label: '/1K' },
          ]}
          value={props.tokenUnit}
          onChange={(v) => props.onTokenUnitChange(v)}
        />

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            render={
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-9 gap-1.5 rounded-full px-4 text-xs'
              />
            }
          >
            <ArrowUpDown className='size-3.5' />
            <span>{sortLabels[props.sortBy as SortOption] || t('Sort')}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-44'>
            <DropdownMenuGroup>
              {Object.entries(sortLabels).map(([value, label]) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => props.onSortChange(value)}
                  className='gap-2'
                >
                  <Check
                    className={cn(
                      'size-4 shrink-0',
                      props.sortBy === value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DataTableViewModeToggle
          value={props.viewMode}
          onChange={props.onViewModeChange}
        />
      </div>

      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent
          side='left'
          className={sideDrawerContentClassName('sm:max-w-md')}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>{t('Filter')}</SheetTitle>
            <SheetDescription>
              {t('Filter models by provider, group, type, endpoint, and tags.')}
            </SheetDescription>
          </SheetHeader>
          <div className={sideDrawerFormClassName('gap-0')}>
            <PricingSidebar
              quotaTypeFilter={props.quotaTypeFilter}
              endpointTypeFilter={props.endpointTypeFilter}
              vendorFilter={props.vendorFilter}
              groupFilter={props.groupFilter}
              tagFilter={props.tagFilter}
              onQuotaTypeChange={props.onQuotaTypeChange}
              onEndpointTypeChange={props.onEndpointTypeChange}
              onVendorChange={props.onVendorChange}
              onGroupChange={props.onGroupChange}
              onTagChange={props.onTagChange}
              priceRange={props.priceRange}
              onPriceRangeChange={props.onPriceRangeChange}
              freeOnly={props.freeOnly}
              onFreeOnlyChange={props.onFreeOnlyChange}
              vendors={props.vendors}
              groups={props.groups}
              groupRatios={props.groupRatios}
              tags={props.tags}
              models={props.models}
              hasActiveFilters={props.hasActiveFilters}
              onClearFilters={props.onClearFilters}
              className='border-0 bg-transparent p-0 shadow-none'
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
