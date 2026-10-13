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
  hasThemePreference,
  readThemePreference,
  THEME_STORAGE_KEYS,
  writeThemePreference,
} from '@/lib/theme-storage'
import { useSystemConfigStore } from '@/stores/system-config-store'

type Theme = 'dark' | 'light' | 'system'
type ResolvedTheme = Exclude<Theme, 'system'>

const DEFAULT_THEME = 'system'
const THEMES = new Set<Theme>(['dark', 'light', 'system'])

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  defaultTheme: Theme
  resolvedTheme: ResolvedTheme
  theme: Theme
  setTheme: (theme: Theme) => void
  resetTheme: () => void
}

const initialState: ThemeProviderState = {
  defaultTheme: DEFAULT_THEME,
  resolvedTheme: 'light',
  theme: DEFAULT_THEME,
  setTheme: () => null,
  resetTheme: () => null,
}

const ThemeContext = createContext<ThemeProviderState>(initialState)

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme
}

export function ThemeProvider({
  children,
  defaultTheme,
  storageKey = THEME_STORAGE_KEYS.mode,
  ...props
}: ThemeProviderProps) {
  // Site-wide mode default from 系统设置 → 站点与品牌 → 主题设置; acts as the
  // fallback for visitors without a personal light/dark preference.
  const siteDefaultTheme = useSystemConfigStore(
    (s) => s.config.themeDefaults?.mode ?? DEFAULT_THEME
  )
  const effectiveDefaultTheme = defaultTheme ?? siteDefaultTheme
  const [theme, _setTheme] = useState<Theme>(() =>
    readThemePreference(storageKey, THEMES, effectiveDefaultTheme)
  )
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(theme)
  )

  useEffect(() => {
    const root = window.document.documentElement
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const nextResolvedTheme = theme === 'system' ? getSystemTheme() : theme
      root.classList.remove('light', 'dark')
      root.classList.add(nextResolvedTheme)
      setResolvedTheme(nextResolvedTheme)
    }

    applyTheme()

    mediaQuery.addEventListener('change', applyTheme)

    return () => mediaQuery.removeEventListener('change', applyTheme)
  }, [theme])

  // Follow site-wide default changes (admin saves in system settings) unless
  // the visitor has a personal preference or the default was pinned via props.
  useEffect(() => {
    if (defaultTheme !== undefined) return
    if (hasThemePreference(storageKey)) return
    _setTheme(siteDefaultTheme)
  }, [defaultTheme, siteDefaultTheme, storageKey])

  const setTheme = useCallback(
    (theme: Theme) => {
      writeThemePreference(storageKey, theme)
      _setTheme(theme)
    },
    [storageKey]
  )

  const resetTheme = useCallback(() => {
    writeThemePreference(storageKey, null)
    _setTheme(effectiveDefaultTheme)
  }, [effectiveDefaultTheme, storageKey])

  const contextValue = useMemo(
    () => ({
      defaultTheme: effectiveDefaultTheme,
      resolvedTheme,
      resetTheme,
      theme,
      setTheme,
    }),
    [effectiveDefaultTheme, resolvedTheme, resetTheme, theme, setTheme]
  )

  return (
    <ThemeContext value={contextValue} {...props}>
      {children}
    </ThemeContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext)

  if (!context) throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
