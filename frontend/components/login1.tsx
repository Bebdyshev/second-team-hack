'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'

const QUOTES = [
  {
    text: 'The greatest threat to our planet is the belief that someone else will save it.',
    author: 'Robert Swan',
  },
  {
    text: 'Energy efficiency is the cleanest, safest, most cost-effective resource.',
    author: 'Alliance to Save Energy',
  },
  {
    text: 'The best way to predict the future is to create it.',
    author: 'Peter Drucker',
  },
  {
    text: 'Sustainability is no longer about doing less harm. It\'s about doing more good.',
    author: 'Jochen Zeitz',
  },
  {
    text: 'What gets measured gets managed.',
    author: 'Peter Drucker',
  },
  {
    text: 'We do not inherit the earth from our ancestors, we borrow it from our children.',
    author: 'Native American Proverb',
  },
  {
    text: 'Smart buildings are the foundation of smart cities.',
    author: 'World Green Building Council',
  },
  {
    text: 'The cheapest energy is the energy you never use.',
    author: 'Amory Lovins',
  },
]

type Login1Props = {
  heading?: string
  buttonText?: string
  googleText?: string
  email: string
  password: string
  error?: string
  isSubmitting?: boolean
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: () => void
  onGoogleClick?: () => void
}

export const Login1 = ({
  heading,
  buttonText = 'Login',
  email,
  password,
  error,
  isSubmitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: Login1Props) => {
  const { locale, setLocale } = useLanguage()
  const [quote, setQuote] = useState(QUOTES[0])

  useEffect(() => {
    const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)]
    setQuote(randomQuote)
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
    <main className="relative h-screen overflow-hidden lg:grid lg:grid-cols-2">
      <div className="relative hidden h-full flex-col border-r border-slate-200 bg-slate-50 p-10 lg:flex">
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-white/80 to-transparent" />
        <div className="z-10 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-xl text-slate-700">
              &ldquo;{quote.text}&rdquo;
            </p>
            <footer className="font-mono text-sm font-semibold text-slate-500">
              ~ {quote.author}
            </footer>
          </blockquote>
        </div>

        <div className="absolute inset-0">
          <FloatingPaths position={1} />
          <FloatingPaths position={-1} />
        </div>
      </div>

      <div className="relative flex min-h-screen flex-col justify-center p-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 isolate -z-10 opacity-60"
        >
          <div className="absolute right-0 top-0 h-[500px] w-[350px] -translate-y-1/3 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,rgba(16,185,129,0.08)_0%,rgba(16,185,129,0.02)_50%,rgba(16,185,129,0.005)_80%)]" />
          <div className="absolute right-0 top-0 h-[500px] w-[150px] translate-x-[5%] -translate-y-1/2 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,rgba(16,185,129,0.06)_0%,rgba(16,185,129,0.01)_80%,transparent_100%)]" />
        </div>

        <div className="absolute right-4 top-4 z-20">
          <Select value={locale} onValueChange={(value) => setLocale(value as 'en' | 'ru')}>
            <SelectTrigger className="h-8 w-[90px] text-xs">
              <SelectValue placeholder="Lang" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ru">RU</SelectItem>
              <SelectItem value="en">EN</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-sm space-y-6">
          <div className="flex flex-col gap-1 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-md">
                <svg className="size-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-emerald-600">ResMonitor</h2>
                <p className="text-xs font-medium text-slate-500">Smart Building OS</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {heading ?? 'ResMonitor'}
            </h1>
            <p className="text-lg font-medium text-slate-500">
              {locale === 'ru' ? 'Вход в систему' : 'Sign In'}
            </p>
            <p className="text-sm text-slate-400">
              {locale === 'ru' ? 'Введите email и пароль для входа' : 'Enter your email and password to continue'}
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              onSubmit()
            }}
          >
            {error ? (
              <div className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-600" role="alert">
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">{locale === 'ru' ? 'Почта' : 'Email'}</Label>
              <Input
                id="email"
                placeholder={locale === 'ru' ? 'name@example.com' : 'name@example.com'}
                type="email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="email"
                aria-label={locale === 'ru' ? 'Почта' : 'Email'}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{locale === 'ru' ? 'Пароль' : 'Password'}</Label>
              <Input
                id="password"
                placeholder={locale === 'ru' ? 'Введите пароль' : 'Enter password'}
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="current-password"
                aria-label={locale === 'ru' ? 'Пароль' : 'Password'}
                required
              />
            </div>

            <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
              {isSubmitting ? (locale === 'ru' ? 'Загрузка...' : 'Signing in...') : buttonText}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-400">
            {locale === 'ru' ? 'Нет аккаунта? ' : "Don't have an account? "}
            <a
              href="/register"
              className="font-medium text-emerald-600 underline-offset-4 transition-colors hover:text-emerald-700 hover:underline"
              tabIndex={0}
              aria-label={locale === 'ru' ? 'Регистрация' : 'Sign up'}
            >
              {locale === 'ru' ? 'Зарегистрируйтесь' : 'Sign up'}
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}

const FloatingPaths = ({ position }: { position: number }) => {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
  }))

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        className="h-full w-full text-emerald-600"
        viewBox="0 0 696 316"
        fill="none"
      >
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.1 + path.id * 0.03}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.6, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'linear',
            }}
          />
        ))}
      </svg>
    </div>
  )
}
