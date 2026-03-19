'use client'

import { FcGoogle } from 'react-icons/fc'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'

interface Login1Props {
  heading?: string
  logo?: {
    url: string
    src: string
    alt: string
    title?: string
  }
  buttonText?: string
  googleText?: string
  signupText?: string
  signupUrl?: string
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
  logo = {
    url: 'https://www.shadcnblocks.com',
    src: 'https://www.shadcnblocks.com/images/block/logos/shadcnblockscom-wordmark.svg',
    alt: 'logo',
    title: 'shadcnblocks.com',
  },
  buttonText = 'Login',
  googleText = 'Sign up with Google',
  signupText = "Don't have an account?",
  signupUrl = '/register',
  email,
  password,
  error,
  isSubmitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onGoogleClick,
}: Login1Props) => {
  const { locale, setLocale } = useLanguage()

  return (
    <section className='bg-muted bg-background h-screen'>
      <div className='flex h-full items-center justify-center'>
        <div className='border-muted bg-background relative flex w-full max-w-sm flex-col items-center gap-y-8 rounded-md border px-6 py-12 shadow-md'>
          <div className='absolute right-4 top-4'>
            <Select value={locale} onValueChange={(value) => setLocale(value as 'en' | 'ru')}>
              <SelectTrigger className='h-8 w-[90px] text-xs'>
                <SelectValue placeholder='Lang' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ru'>RU</SelectItem>
                <SelectItem value='en'>EN</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='flex flex-col items-center gap-y-2'>
            {heading ? <h1 className='text-3xl font-semibold'>{heading}</h1> : null}
          </div>
          <div className='flex w-full flex-col gap-8'>
            <div className='flex flex-col gap-4'>
              <div className='flex flex-col gap-2'>
                <Input type='email' placeholder={locale == 'ru' ? 'Почта' : 'Email'} required value={email} onChange={(event) => onEmailChange(event.target.value)} />
              </div>
              <div className='flex flex-col gap-2'>
                <Input type='password' placeholder={locale == 'ru' ? 'Пароль' : 'Password'} required value={password} onChange={(event) => onPasswordChange(event.target.value)} />
              </div>
              {error ? <p className='text-sm text-red-600'>{error}</p> : null}
              <div className='flex flex-col gap-4'>
                <Button type='button' className='mt-2 w-full' disabled={isSubmitting} onClick={onSubmit}>
                  {isSubmitting ? (locale == 'ru' ? 'Загрузка...' : 'Loading...') : buttonText}
                </Button>
                <Button type='button' variant='outline' className='w-full' onClick={onGoogleClick}>
                  <FcGoogle className='mr-2 size-5' />
                  {googleText}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
