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
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import type { Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { MultiSelect } from '@/components/multi-select'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { getPricing } from '@/features/pricing/api'
import {
  MAX_FEATURED_MODELS,
  parseFeaturedModelNames,
} from '@/features/pricing/lib/featured'
import { requireServerSuccess } from '@/lib/server-error-message'

import { FormDirtyIndicator } from '../components/form-dirty-indicator'
import { FormNavigationGuard } from '../components/form-navigation-guard'
import {
  SettingsForm,
  SettingsFormGrid,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useSettingsForm } from '../hooks/use-settings-form'
import { useUpdateOption } from '../hooks/use-update-option'

const featuredModelsSchema = z.object({
  PricingFeaturedModels: z.string(),
})

type FeaturedModelsFormValues = z.infer<typeof featuredModelsSchema>

type FeaturedModelsSectionProps = {
  defaultValues: FeaturedModelsFormValues
}

function normalizeValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : String(value)
}

export function FeaturedModelsSection({
  defaultValues,
}: FeaturedModelsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const normalizedDefaults: FeaturedModelsFormValues = {
    PricingFeaturedModels: normalizeValue(defaultValues.PricingFeaturedModels),
  }

  const { form, handleSubmit, handleReset, isDirty, isSubmitting } =
    useSettingsForm<FeaturedModelsFormValues>({
      resolver: zodResolver(featuredModelsSchema) as Resolver<
        FeaturedModelsFormValues,
        unknown,
        FeaturedModelsFormValues
      >,
      defaultValues: normalizedDefaults,
      onSubmit: async (_data, changedFields) => {
        for (const [key, value] of Object.entries(changedFields)) {
          await updateOption.mutateAsync({
            key,
            value: normalizeValue(value),
          })
        }
      },
    })

  // Reuse the public pricing query (same cache as the model square page) to
  // list selectable model names.
  const pricingQuery = useQuery({
    queryKey: ['pricing'],
    queryFn: async () => requireServerSuccess(await getPricing()),
    staleTime: 5 * 60 * 1000,
  })

  const modelOptions = useMemo(
    () =>
      (pricingQuery.data?.data ?? []).map((model) => ({
        label: model.model_name,
        value: model.model_name,
      })),
    [pricingQuery.data]
  )

  const handleSelectionChange = (values: string[], onChange: (v: string) => void) => {
    if (values.length > MAX_FEATURED_MODELS) {
      toast.info(
        t('You can select up to {{count}} featured models', {
          count: MAX_FEATURED_MODELS,
        })
      )
      return
    }
    onChange(JSON.stringify(values))
  }

  return (
    <>
      <FormNavigationGuard when={isDirty} />

      <SettingsSection title={t('Model Square Featured Models')}>
        <Form {...form}>
          <SettingsForm onSubmit={handleSubmit}>
            <SettingsPageFormActions
              onSave={handleSubmit}
              onReset={handleReset}
              isSaving={isSubmitting || updateOption.isPending}
              isResetDisabled={!isDirty}
            />
            <FormDirtyIndicator isDirty={isDirty} />
            <SettingsFormGrid>
              <FormField
                control={form.control}
                name='PricingFeaturedModels'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Featured Models')}</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={modelOptions}
                        selected={parseFeaturedModelNames(field.value)}
                        onChange={(values) =>
                          handleSelectionChange(values, field.onChange)
                        }
                        allowCreate
                        createLabel={t('Add custom model "{{value}}"')}
                        placeholder={t('Search models...')}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Pick up to {{count}} models to pin at the top of the model square. Leave empty to feature the first {{count}} enabled models.',
                        { count: MAX_FEATURED_MODELS }
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SettingsFormGrid>
          </SettingsForm>
        </Form>
      </SettingsSection>
    </>
  )
}
