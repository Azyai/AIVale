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
import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import { RadioGroup as Radio } from '@base-ui/react/radio-group'
import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck } from 'lucide-react'
import { useEffect, useMemo, type SVGProps } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { IconThemeDark } from '@/assets/custom/icon-theme-dark'
import { IconThemeLight } from '@/assets/custom/icon-theme-light'
import { IconThemeSystem } from '@/assets/custom/icon-theme-system'
import { Form } from '@/components/ui/form'
import {
  DEFAULT_SITE_THEME,
  serializeSiteThemeDefaults,
  THEME_PRESETS,
  type SiteThemeDefaults,
} from '@/lib/theme-customization'
import { cn } from '@/lib/utils'

import { FormNavigationGuard } from '../components/form-navigation-guard'
import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const Item = RadioPrimitive.Root

const PRESET_VALUES = THEME_PRESETS.map((preset) => preset.value) as [
  SiteThemeDefaults['preset'],
  ...SiteThemeDefaults['preset'][],
]

const themeDefaultsSchema = z.object({
  mode: z.enum(['dark', 'light', 'system']),
  preset: z.enum(PRESET_VALUES),
  font: z.enum(['default', 'sans', 'serif']),
  radius: z.enum(['default', 'none', 'sm', 'md', 'lg', 'xl']),
  scale: z.enum(['default', 'sm', 'lg', 'xl']),
  contentLayout: z.enum(['full', 'centered']),
})

type ThemeDefaultsFormValues = z.infer<typeof themeDefaultsSchema>

type FormReturn = UseFormReturn<ThemeDefaultsFormValues>

type ThemeDefaultsSectionProps = {
  config: SiteThemeDefaults
  initialSerialized: string
}

export function ThemeDefaultsSection({
  config,
  initialSerialized,
}: ThemeDefaultsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const formDefaults = useMemo<ThemeDefaultsFormValues>(
    () => ({
      mode: config.mode,
      preset: config.preset,
      font: config.font,
      radius: config.radius,
      scale: config.scale,
      contentLayout: config.contentLayout,
    }),
    [config]
  )

  const form = useForm<ThemeDefaultsFormValues>({
    resolver: zodResolver(themeDefaultsSchema),
    defaultValues: formDefaults,
  })

  useEffect(() => {
    form.reset(formDefaults)
  }, [formDefaults, form])

  const onSubmit = async (values: ThemeDefaultsFormValues) => {
    const serialized = serializeSiteThemeDefaults(values)
    if (serialized === initialSerialized) {
      return
    }

    await updateOption.mutateAsync({
      key: 'ThemeDefaults',
      value: serialized,
    })
  }

  const resetToDefault = () => {
    form.reset(DEFAULT_SITE_THEME)
  }

  return (
    <SettingsSection title={t('Theme Settings')}>
      <p className='text-muted-foreground mb-2 text-sm'>
        {t(
          'Set the default theme for the whole site. Visitors without a personal light/dark preference will see it.'
        )}
      </p>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <FormNavigationGuard when={form.formState.isDirty} />
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            onReset={resetToDefault}
            isSaving={updateOption.isPending}
            isSaveDisabled={!form.formState.isDirty}
          />
          <ModeConfig form={form} />
          <PresetConfig form={form} />
          <FontConfig form={form} />
          <RadiusConfig form={form} />
          <ScaleConfig form={form} />
          <ContentLayoutConfig form={form} />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}

function GroupTitle(props: { title: string }) {
  return (
    <div className='text-muted-foreground mb-2 text-sm font-semibold'>
      {props.title}
    </div>
  )
}

function setFormValue(
  form: FormReturn,
  name: keyof ThemeDefaultsFormValues,
  value: string
) {
  form.setValue(name, value as ThemeDefaultsFormValues[typeof name], {
    shouldDirty: true,
  })
}

function ModeConfig({ form }: { form: FormReturn }) {
  const { t } = useTranslation()
  return (
    <div>
      <GroupTitle title={t('Theme')} />
      <Radio
        value={form.watch('mode')}
        onValueChange={(value) => setFormValue(form, 'mode', value)}
        className='grid w-full max-w-md grid-cols-3 gap-4'
        aria-label={t('Select theme preference')}
      >
        {[
          { value: 'system', label: t('System'), icon: IconThemeSystem },
          { value: 'light', label: t('Light'), icon: IconThemeLight },
          { value: 'dark', label: t('Dark'), icon: IconThemeDark },
        ].map((item) => (
          <IconRadioItem key={item.value} item={item} isTheme />
        ))}
      </Radio>
    </div>
  )
}

function IconRadioItem(props: {
  item: {
    value: string
    label: string
    icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement
  }
  isTheme?: boolean
}) {
  const isTheme = props.isTheme ?? false
  return (
    <Item
      value={props.item.value}
      className={cn('group outline-none', 'transition duration-200 ease-in')}
      aria-label={props.item.label}
    >
      <div
        className={cn(
          'ring-border relative rounded-md ring-[1px]',
          'group-data-checked:ring-primary group-data-checked:shadow-2xl',
          'group-focus-visible:ring-2'
        )}
        role='img'
        aria-label={`${props.item.label} option preview`}
      >
        <CircleCheck
          className={cn(
            'fill-primary size-6 stroke-white',
            'group-data-unchecked:hidden',
            'absolute top-0 right-0 translate-x-1/2 -translate-y-1/2'
          )}
          aria-hidden='true'
        />
        <props.item.icon
          className={cn(
            !isTheme &&
              'stroke-primary fill-primary group-data-unchecked:stroke-muted-foreground group-data-unchecked:fill-muted-foreground'
          )}
          aria-hidden='true'
        />
      </div>
      <div className='mt-1 text-xs'>{props.item.label}</div>
    </Item>
  )
}

function PresetConfig({ form }: { form: FormReturn }) {
  const { t } = useTranslation()
  return (
    <div>
      <GroupTitle title={t('Color preset')} />
      <Radio
        value={form.watch('preset')}
        onValueChange={(value) => setFormValue(form, 'preset', value)}
        className='grid w-full grid-cols-4 gap-3'
        aria-label={t('Select color preset')}
      >
        {THEME_PRESETS.map((preset) => (
          <Item
            key={preset.value}
            value={preset.value}
            className='group flex flex-col items-stretch outline-none'
            aria-label={t(`preset.${preset.value}`)}
          >
            <div
              className={cn(
                'ring-border relative h-12 rounded-md ring-[1px] transition',
                'group-data-checked:ring-primary group-data-checked:shadow-md',
                'group-focus-visible:ring-2',
                'group-hover:ring-primary/60'
              )}
            >
              <div
                aria-hidden='true'
                className='absolute inset-0 rounded-md'
                style={{
                  background:
                    preset.value === 'default'
                      ? 'linear-gradient(135deg, oklch(0.68 0.2 25) 0%, oklch(0.8 0.17 85) 25%, oklch(0.72 0.18 155) 50%, oklch(0.66 0.19 245) 75%, oklch(0.68 0.2 315) 100%)'
                      : `linear-gradient(135deg, ${preset.swatches[0]} 0%, ${preset.swatches[1] ?? preset.swatches[0]} 100%)`,
                }}
              />
              <CircleCheck
                className={cn(
                  'fill-primary absolute top-0 right-0 z-10 size-5 translate-x-1/2 -translate-y-1/2 stroke-white',
                  'group-data-unchecked:hidden'
                )}
                aria-hidden='true'
              />
            </div>
            <div className='mt-1.5 truncate text-center text-xs'>
              {t(`preset.${preset.value}`)}
            </div>
          </Item>
        ))}
      </Radio>
    </div>
  )
}

/**
 * Font options. Each renders a live "Aa" preview in the font it represents.
 * `Auto` leaves the preview font undefined so it inherits the currently
 * active body font, matching how the theme resolves `font: 'default'`.
 */
const FONT_OPTIONS: {
  value: SiteThemeDefaults['font']
  label: string
  preview?: string
}[] = [
  { value: 'default', label: 'Auto', preview: undefined },
  { value: 'sans', label: 'Sans', preview: 'var(--font-sans)' },
  { value: 'serif', label: 'Serif', preview: 'var(--font-serif)' },
]

function FontConfig({ form }: { form: FormReturn }) {
  const { t } = useTranslation()
  return (
    <div>
      <GroupTitle title={t('Font')} />
      <Radio
        value={form.watch('font')}
        onValueChange={(value) => setFormValue(form, 'font', value)}
        className='grid w-full grid-cols-3 gap-4'
        aria-label={t('Select body font')}
      >
        {FONT_OPTIONS.map((option) => (
          <Item
            key={option.value}
            value={option.value}
            className='group flex flex-col items-stretch outline-none'
            aria-label={
              option.value === 'default' ? t('System default') : option.label
            }
          >
            <div
              className={cn(
                'ring-border relative h-12 rounded-md ring-[1px] transition',
                'group-data-checked:ring-primary group-data-checked:shadow-md',
                'group-focus-visible:ring-2',
                'group-hover:ring-primary/60'
              )}
            >
              <CircleCheck
                className={cn(
                  'fill-primary absolute top-0 right-0 z-10 size-5 translate-x-1/2 -translate-y-1/2 stroke-white',
                  'group-data-unchecked:hidden'
                )}
                aria-hidden='true'
              />
              <span
                aria-hidden='true'
                className='text-foreground absolute inset-0 flex items-center justify-center text-lg leading-none font-medium'
                style={
                  option.preview
                    ? { fontFamily: option.preview }
                    : { font: 'inherit', fontSize: '1.125rem' }
                }
              >
                Aa
              </span>
            </div>
            <div className='mt-1.5 text-center text-xs'>{option.label}</div>
          </Item>
        ))}
      </Radio>
    </div>
  )
}

const RADIUS_OPTIONS: {
  value: SiteThemeDefaults['radius']
  label: string
  preview: string
}[] = [
  { value: 'default', label: 'Auto', preview: '1rem' },
  { value: 'none', label: '0', preview: '0' },
  { value: 'sm', label: '0.3', preview: '0.3rem' },
  { value: 'md', label: '0.5', preview: '0.5rem' },
  { value: 'lg', label: '0.75', preview: '0.75rem' },
  { value: 'xl', label: '1.0', preview: '1rem' },
]

function RadiusConfig({ form }: { form: FormReturn }) {
  const { t } = useTranslation()
  return (
    <div>
      <GroupTitle title={t('Border radius')} />
      <Radio
        value={form.watch('radius')}
        onValueChange={(value) => setFormValue(form, 'radius', value)}
        className='grid w-full grid-cols-6 gap-2'
        aria-label={t('Select border radius')}
      >
        {RADIUS_OPTIONS.map((option) => (
          <Item
            key={option.value}
            value={option.value}
            className='group flex flex-col items-stretch outline-none'
            aria-label={
              option.value === 'default' ? t('System default') : option.label
            }
          >
            <div
              className={cn(
                'ring-border relative h-12 rounded-md ring-[1px] transition',
                'group-data-checked:ring-primary group-data-checked:shadow-md',
                'group-focus-visible:ring-2',
                'group-hover:ring-primary/60'
              )}
            >
              <CircleCheck
                className={cn(
                  'fill-primary absolute top-0 right-0 z-10 size-5 translate-x-1/2 -translate-y-1/2 stroke-white',
                  'group-data-unchecked:hidden'
                )}
                aria-hidden='true'
              />
              <span
                aria-hidden='true'
                className='border-foreground/70 absolute top-2.5 left-2.5 size-3.5 border-t-[1.5px] border-l-[1.5px]'
                style={{ borderTopLeftRadius: option.preview }}
              />
            </div>
            <div className='mt-1.5 text-center text-xs'>{option.label}</div>
          </Item>
        ))}
      </Radio>
    </div>
  )
}

/**
 * Visual preview rows for the density option. Each row's height represents
 * the relative line-height density (compact = tight rows, comfortable = wide).
 */
function ScalePreview(props: { rows: number; rowGap: string }) {
  return (
    <div
      aria-hidden='true'
      className='absolute inset-2.5 flex flex-col justify-center'
      style={{ gap: props.rowGap }}
    >
      {Array.from({ length: props.rows }, (_, index) => 85 - index * 10).map(
        (width) => (
          <span
            key={width}
            className='bg-foreground/60 block h-[2px] rounded-full'
            style={{ width: `${width}%` }}
          />
        )
      )}
    </div>
  )
}

function ScaleConfig({ form }: { form: FormReturn }) {
  const { t } = useTranslation()
  const scaleOptions: {
    value: SiteThemeDefaults['scale']
    label: string
    rows: number
    rowGap: string
  }[] = [
    { value: 'sm', label: t('Compact'), rows: 4, rowGap: '3px' },
    { value: 'default', label: t('Default'), rows: 3, rowGap: '6px' },
    { value: 'lg', label: t('Comfortable'), rows: 2, rowGap: '10px' },
    { value: 'xl', label: t('Super Large'), rows: 1, rowGap: '14px' },
  ]
  return (
    <div>
      <GroupTitle title={t('Density')} />
      <Radio
        value={form.watch('scale')}
        onValueChange={(value) => setFormValue(form, 'scale', value)}
        className='grid w-full grid-cols-4 gap-3'
        aria-label={t('Select interface density')}
      >
        {scaleOptions.map((option) => (
          <Item
            key={option.value}
            value={option.value}
            className='group flex flex-col items-stretch outline-none'
            aria-label={option.label}
          >
            <div
              className={cn(
                'ring-border relative h-12 rounded-md ring-[1px] transition',
                'group-data-checked:ring-primary group-data-checked:shadow-md',
                'group-focus-visible:ring-2',
                'group-hover:ring-primary/60'
              )}
            >
              <CircleCheck
                className={cn(
                  'fill-primary absolute top-0 right-0 z-10 size-5 translate-x-1/2 -translate-y-1/2 stroke-white',
                  'group-data-unchecked:hidden'
                )}
                aria-hidden='true'
              />
              <ScalePreview rows={option.rows} rowGap={option.rowGap} />
            </div>
            <div className='mt-1.5 truncate text-center text-xs'>
              {option.label}
            </div>
          </Item>
        ))}
      </Radio>
    </div>
  )
}

/**
 * Mini "page" mock used as the visual preview for content-width options.
 * `full` fills horizontally, `centered` clamps the body to a narrow column.
 */
function ContentLayoutPreview(props: { centered: boolean }) {
  return (
    <div aria-hidden='true' className='absolute inset-2 flex flex-col gap-1.5'>
      <span className='bg-foreground/40 block h-1.5 w-full rounded-sm' />
      <div
        className={cn(
          'flex flex-1 flex-col gap-1',
          props.centered ? 'mx-auto w-1/2' : 'w-full'
        )}
      >
        <span className='bg-foreground/60 block h-[2px] w-full rounded-full' />
        <span className='bg-foreground/60 block h-[2px] w-3/4 rounded-full' />
      </div>
    </div>
  )
}

function ContentLayoutConfig({ form }: { form: FormReturn }) {
  const { t } = useTranslation()
  return (
    <div>
      <GroupTitle title={t('Content width')} />
      <Radio
        value={form.watch('contentLayout')}
        onValueChange={(value) => setFormValue(form, 'contentLayout', value)}
        className='grid w-full grid-cols-2 gap-4'
        aria-label={t('Select content width')}
      >
        {[
          { value: 'full', label: t('Full width') },
          { value: 'centered', label: t('Centered') },
        ].map((option) => (
          <Item
            key={option.value}
            value={option.value}
            className='group flex flex-col items-stretch outline-none'
            aria-label={option.label}
          >
            <div
              className={cn(
                'ring-border relative h-12 rounded-md ring-[1px] transition',
                'group-data-checked:ring-primary group-data-checked:shadow-md',
                'group-focus-visible:ring-2',
                'group-hover:ring-primary/60'
              )}
            >
              <CircleCheck
                className={cn(
                  'fill-primary absolute top-0 right-0 z-10 size-5 translate-x-1/2 -translate-y-1/2 stroke-white',
                  'group-data-unchecked:hidden'
                )}
                aria-hidden='true'
              />
              <ContentLayoutPreview centered={option.value === 'centered'} />
            </div>
            <div className='mt-1.5 truncate text-center text-xs'>
              {option.label}
            </div>
          </Item>
        ))}
      </Radio>
    </div>
  )
}
