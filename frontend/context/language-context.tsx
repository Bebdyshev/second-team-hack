'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type Locale = 'en' | 'ru'

type LanguageContextValue = {
  locale: Locale
  setLocale: (nextLocale: Locale) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)
const LOCALE_KEY = 'proactive_locale'

const messages: Record<Locale, Record<string, string>> = {
  en: {
    platform: 'ProActive Platform',
    searchCommands: 'Search commands...',
    live: 'Live',
    add: 'Add',
    action: 'Action',
    settings: 'Settings',
    checks: 'Checks',
    alerts: 'Alerts',
    setup: 'Setup',
    logout: 'Logout',
    role: 'Role',
    health: 'Health',
    home: 'Home',
    workspaces: 'Workspaces',
    tasks: 'Tasks',
    data: 'Data',
    knowledge: 'Knowledge',
    agents: 'Agents',
    legal: 'Legal',
  },
  ru: {
    platform: 'Платформа ProActive',
    searchCommands: 'Поиск команд...',
    live: 'Онлайн',
    add: 'Добавить',
    action: 'Действие',
    settings: 'Настройки',
    checks: 'Проверки',
    alerts: 'Алерты',
    setup: 'Конфиг',
    logout: 'Выйти',
    role: 'Роль',
    health: 'Статус',
    home: 'Главная',
    workspaces: 'Пространства',
    tasks: 'Задачи',
    data: 'Данные',
    knowledge: 'База знаний',
    agents: 'Агенты',
    legal: 'Юрист',
  },
}

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [locale, setLocaleState] = useState<Locale>('ru')

  useEffect(() => {
    const storedLocale = localStorage.getItem(LOCALE_KEY) as Locale | null
    if (storedLocale == 'en' || storedLocale == 'ru') {
      setLocaleState(storedLocale)
    }
  }, [])

  const setLocale = (nextLocale: Locale) => {
    localStorage.setItem(LOCALE_KEY, nextLocale)
    setLocaleState(nextLocale)
  }

  const t = (key: string) => messages[locale][key] ?? key

  const value = useMemo(() => ({ locale, setLocale, t }), [locale])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export const useLanguage = () => {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider')
  }
  return context
}
