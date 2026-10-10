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
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { uploadLoginMedia } from '../api'
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

const MAX_LOGIN_MEDIA_SIZE = 50 * 1024 * 1024

const loginBrandingSchema = z.object({
  LoginPanelTitle: z.string(),
  LoginPanelDescription: z.string(),
  LoginPanelMedia: z.string(),
  LoginPanelTags: z.string(),
})

type LoginBrandingFormValues = z.infer<typeof loginBrandingSchema>

type LoginBrandingSectionProps = {
  defaultValues: LoginBrandingFormValues
}

function normalizeValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : String(value)
}

function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|webm)(?:\?|$)/i.test(url)
}

/**
 * Row editor for the newline-separated LoginPanelTags option: one input per
 * tag, free add/remove. Empty rows are dropped when the login page renders.
 */
function TagsEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const rows = value === '' ? [] : value.split('\n')

  const updateRow = (index: number, text: string) => {
    onChange(
      rows.map((row, i) => (i === index ? text : row)).join('\n')
    )
  }

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index).join('\n'))
  }

  const addRow = () => {
    onChange([...rows, ''].join('\n'))
  }

  return (
    <div className='space-y-2'>
      {rows.map((row, index) => (
        <div key={index} className='flex gap-2'>
          <Input
            value={row}
            onChange={(event) => updateRow(index, event.target.value)}
            placeholder={t('Value and label (separated by a space)')}
          />
          <Button
            type='button'
            variant='outline'
            size='icon'
            className='shrink-0'
            aria-label={t('Remove')}
            onClick={() => removeRow(index)}
          >
            <X className='h-4 w-4' />
          </Button>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        className='gap-2'
        onClick={addRow}
      >
        <Plus className='h-4 w-4' />
        {t('Add tag')}
      </Button>
    </div>
  )
}

export function LoginBrandingSection({
  defaultValues,
}: LoginBrandingSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const normalizedDefaults: LoginBrandingFormValues = {
    LoginPanelTitle: normalizeValue(defaultValues.LoginPanelTitle),
    LoginPanelDescription: normalizeValue(defaultValues.LoginPanelDescription),
    LoginPanelMedia: normalizeValue(defaultValues.LoginPanelMedia),
    LoginPanelTags: normalizeValue(defaultValues.LoginPanelTags),
  }

  const { form, handleSubmit, handleReset, isDirty, isSubmitting } =
    useSettingsForm<LoginBrandingFormValues>({
      resolver: zodResolver(loginBrandingSchema) as Resolver<
        LoginBrandingFormValues,
        unknown,
        LoginBrandingFormValues
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

  const mediaUrl = form.watch('LoginPanelMedia') || ''

  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const file = event.target.files?.[0]
    // Reset the input so selecting the same file again re-triggers onChange.
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_LOGIN_MEDIA_SIZE) {
      toast.error(t('Media file exceeds the 50 MB limit'))
      return
    }

    setIsUploading(true)
    try {
      const res = requireServerSuccess(await uploadLoginMedia(file))
      form.setValue('LoginPanelMedia', res.data?.url ?? '', {
        shouldDirty: true,
      })
      toast.success(t('Media uploaded. Remember to save the form.'))
    } catch (error) {
      handleServerError(error, t('Failed to upload media'))
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <>
      <FormNavigationGuard when={isDirty} />

      <SettingsSection title={t('Login Page Branding')}>
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
                name='LoginPanelTitle'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Login panel title')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('Unified access to large models')}
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Title shown above the media on the login page. Leave empty to use the default copy.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='LoginPanelDescription'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Login panel description')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('Intelligent services, on demand')}
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Description text shown under the title. Leave empty to hide it.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='LoginPanelMedia'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Login panel media')}</FormLabel>
                    <div className='flex gap-2'>
                      <FormControl>
                        <Input
                          placeholder='/uploads/login-media.mp4'
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type='button'
                        variant='outline'
                        className='shrink-0 gap-2'
                        disabled={isUploading}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {isUploading ? (
                          <Loader2 className='h-4 w-4 animate-spin' />
                        ) : (
                          <Upload className='h-4 w-4' />
                        )}
                        {t('Upload media')}
                      </Button>
                      {field.value && (
                        <Button
                          type='button'
                          variant='outline'
                          className='shrink-0'
                          onClick={() =>
                            form.setValue('LoginPanelMedia', '', {
                              shouldDirty: true,
                            })
                          }
                        >
                          {t('Clear')}
                        </Button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type='file'
                      accept='video/mp4,video/webm,image/gif,image/png,image/jpeg,image/webp,image/svg+xml'
                      className='hidden'
                      onChange={handleFileChange}
                    />
                    {mediaUrl && (
                      <div className='bg-muted/50 flex max-h-72 items-center justify-center overflow-hidden rounded-lg border p-2'>
                        {isVideoMediaUrl(mediaUrl) ? (
                          <video
                            src={mediaUrl}
                            autoPlay
                            muted
                            loop
                            playsInline
                            className='max-h-64 w-auto rounded-md'
                          />
                        ) : (
                          <img
                            src={mediaUrl}
                            alt=''
                            className='max-h-64 w-auto rounded-md object-contain'
                          />
                        )}
                      </div>
                    )}
                    <FormDescription>
                      {t(
                        'Looping GIF or video shown on the login page left panel (desktop only). Upload a file or paste any URL.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='LoginPanelTags'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Login panel tags')}</FormLabel>
                    <FormControl>
                      <TagsEditor
                        value={field.value ?? ''}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Tags shown at the bottom of the login page left panel. Leave empty to use the default highlights.'
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
