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
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  CONTENT_LAYOUT_VALUES,
  type ContentLayout,
  DEFAULT_THEME_CUSTOMIZATION,
  resolveThemeFont,
  THEME_FONT_VALUES,
  THEME_PRESET_VALUES,
  THEME_RADIUS_VALUES,
  THEME_SCALE_VALUES,
  type ThemeCustomization,
  type ThemeFont,
  type ThemePreset,
  type ThemeRadius,
  type ThemeScale,
} from '@/lib/theme-customization'
import {
  readThemePreference,
  hasThemePreference,
  THEME_STORAGE_KEYS,
  writeThemePreference,
} from '@/lib/theme-storage'
import { useSiteThemeDefaults } from '@/stores/system-config-store'

function applyAttribute(name: string, value: string | null) {
  if (typeof document === 'undefined') return
  const body = document.body
  if (!body) return
  if (value === null) {
    body.removeAttribute(name)
  } else {
    body.setAttribute(name, value)
  }
}

type ThemeCustomizationContextType = {
  defaults: ThemeCustomization
  customization: ThemeCustomization
  setPreset: (preset: ThemePreset) => void
  setFont: (font: ThemeFont) => void
  setRadius: (radius: ThemeRadius) => void
  setScale: (scale: ThemeScale) => void
  setContentLayout: (contentLayout: ContentLayout) => void
  resetCustomization: () => void
}

// Fallback used when a consumer renders outside the provider (e.g. an error
// route mounted before providers are ready, or stale HMR boundaries). Keeping
// it permissive prevents the whole tree from crashing — the UI just behaves
// like the defaults until the real provider re-mounts.
const FALLBACK_CONTEXT: ThemeCustomizationContextType = {
  defaults: DEFAULT_THEME_CUSTOMIZATION,
  customization: DEFAULT_THEME_CUSTOMIZATION,
  setPreset: () => {},
  setFont: () => {},
  setRadius: () => {},
  setScale: () => {},
  setContentLayout: () => {},
  resetCustomization: () => {},
}

const ThemeCustomizationContext =
  createContext<ThemeCustomizationContextType>(FALLBACK_CONTEXT)

export function ThemeCustomizationProvider(props: {
  children: React.ReactNode
}) {
  // Site-wide defaults from 系统设置 → 站点与品牌 → 主题设置; they act as the
  // fallback for every axis the visitor has not personalized.
  const siteTheme = useSiteThemeDefaults()
  const defaults = useMemo<ThemeCustomization>(
    () => ({
      preset: siteTheme.preset,
      font: siteTheme.font,
      radius: siteTheme.radius,
      scale: siteTheme.scale,
      contentLayout: siteTheme.contentLayout,
    }),
    [siteTheme]
  )

  const [preset, _setPreset] = useState<ThemePreset>(() =>
    readThemePreference<ThemePreset>(
      THEME_STORAGE_KEYS.preset,
      THEME_PRESET_VALUES,
      defaults.preset
    )
  )
  const [font, _setFont] = useState<ThemeFont>(() =>
    readThemePreference<ThemeFont>(
      THEME_STORAGE_KEYS.font,
      THEME_FONT_VALUES,
      defaults.font
    )
  )
  const [radius, _setRadius] = useState<ThemeRadius>(() =>
    readThemePreference<ThemeRadius>(
      THEME_STORAGE_KEYS.radius,
      THEME_RADIUS_VALUES,
      defaults.radius
    )
  )
  const [scale, _setScale] = useState<ThemeScale>(() =>
    readThemePreference<ThemeScale>(
      THEME_STORAGE_KEYS.scale,
      THEME_SCALE_VALUES,
      defaults.scale
    )
  )
  const [contentLayout, _setContentLayout] = useState<ContentLayout>(() =>
    readThemePreference<ContentLayout>(
      THEME_STORAGE_KEYS.contentLayout,
      CONTENT_LAYOUT_VALUES,
      defaults.contentLayout
    )
  )

  // Mirror state to the <body> via data-* attributes so theme-presets.css can
  // override CSS variables at the right cascade layer.
  useEffect(() => {
    // Only the literal 'default' preset relies on :root variables; every named
    // preset (including the code default aurora-violet) needs its attribute.
    applyAttribute(
      'data-theme-preset',
      preset === 'default' ? null : preset
    )
  }, [preset])

  // Font is the one axis where we resolve before writing the attribute:
  // the persisted preference may be `default`, but CSS works in terms of
  // the concrete `sans`/`serif` choice that should drive the cascade.
  // Resolving here (instead of in CSS via `:not()` selectors) keeps the
  // stylesheet to one simple `[data-theme-font='serif']` selector and lets
  // future presets opt into typography via `PRESET_DEFAULT_FONT` alone.
  useEffect(() => {
    applyAttribute('data-theme-font', resolveThemeFont(font, preset))
  }, [font, preset])

  useEffect(() => {
    applyAttribute(
      'data-theme-radius',
      radius === DEFAULT_THEME_CUSTOMIZATION.radius ? null : radius
    )
  }, [radius])

  useEffect(() => {
    applyAttribute(
      'data-theme-scale',
      scale === DEFAULT_THEME_CUSTOMIZATION.scale ? null : scale
    )
  }, [scale])

  useEffect(() => {
    applyAttribute('data-theme-content-layout', contentLayout)
  }, [contentLayout])

  // Follow site-wide default changes (admin saves in system settings) for
  // axes the visitor has not personalized.
  useEffect(() => {
    if (!hasThemePreference(THEME_STORAGE_KEYS.preset)) {
      _setPreset(defaults.preset)
    }
    if (!hasThemePreference(THEME_STORAGE_KEYS.font)) {
      _setFont(defaults.font)
    }
    if (!hasThemePreference(THEME_STORAGE_KEYS.radius)) {
      _setRadius(defaults.radius)
    }
    if (!hasThemePreference(THEME_STORAGE_KEYS.scale)) {
      _setScale(defaults.scale)
    }
    if (!hasThemePreference(THEME_STORAGE_KEYS.contentLayout)) {
      _setContentLayout(defaults.contentLayout)
    }
  }, [defaults])

  const setPreset = useCallback(
    (value: ThemePreset) => {
      _setPreset(value)
      writeThemePreference(
        THEME_STORAGE_KEYS.preset,
        value === defaults.preset ? null : value
      )
    },
    [defaults.preset]
  )

  const setFont = useCallback(
    (value: ThemeFont) => {
      _setFont(value)
      writeThemePreference(
        THEME_STORAGE_KEYS.font,
        value === defaults.font ? null : value
      )
    },
    [defaults.font]
  )

  const setRadius = useCallback(
    (value: ThemeRadius) => {
      _setRadius(value)
      writeThemePreference(
        THEME_STORAGE_KEYS.radius,
        value === defaults.radius ? null : value
      )
    },
    [defaults.radius]
  )

  const setScale = useCallback(
    (value: ThemeScale) => {
      _setScale(value)
      writeThemePreference(
        THEME_STORAGE_KEYS.scale,
        value === defaults.scale ? null : value
      )
    },
    [defaults.scale]
  )

  const setContentLayout = useCallback(
    (value: ContentLayout) => {
      _setContentLayout(value)
      writeThemePreference(
        THEME_STORAGE_KEYS.contentLayout,
        value === defaults.contentLayout ? null : value
      )
    },
    [defaults.contentLayout]
  )

  const resetCustomization = useCallback(() => {
    setPreset(defaults.preset)
    setFont(defaults.font)
    setRadius(defaults.radius)
    setScale(defaults.scale)
    setContentLayout(defaults.contentLayout)
  }, [defaults, setPreset, setFont, setRadius, setScale, setContentLayout])

  const value = useMemo<ThemeCustomizationContextType>(
    () => ({
      defaults,
      customization: { preset, font, radius, scale, contentLayout },
      setPreset,
      setFont,
      setRadius,
      setScale,
      setContentLayout,
      resetCustomization,
    }),
    [
      defaults,
      preset,
      font,
      radius,
      scale,
      contentLayout,
      setPreset,
      setFont,
      setRadius,
      setScale,
      setContentLayout,
      resetCustomization,
    ]
  )

  return (
    <ThemeCustomizationContext.Provider value={value}>
      {props.children}
    </ThemeCustomizationContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useThemeCustomization() {
  return useContext(ThemeCustomizationContext)
}
