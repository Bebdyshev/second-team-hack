'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { useAuth } from '@/context/auth-context'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/errors'

const RegisterPage = () => {
  const router = useRouter()
  const { register } = useAuth()
  const { locale } = useLanguage()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await register({ fullName, email, password })
      router.push('/workspace-shell')
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, locale == 'ru' ? 'Ошибка регистрации' : 'Registration failed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6'>
      <h1 className='text-2xl font-bold text-slate-900'>{locale == 'ru' ? 'Регистрация' : 'Register'}</h1>
      <form onSubmit={handleSubmit} className='mt-6 space-y-4'>
        <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={locale == 'ru' ? 'Полное имя' : 'Full name'} className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm' />
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder={locale == 'ru' ? 'Почта' : 'Email'} className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm' />
        <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder={locale == 'ru' ? 'Пароль' : 'Password'} type='password' className='w-full rounded-lg border border-slate-300 px-3 py-2 text-sm' />
        <button type='submit' disabled={isSubmitting} className='w-full rounded-lg bg-slate-900 px-4 py-2 text-sm text-white'>{isSubmitting ? (locale == 'ru' ? 'Создание аккаунта...' : 'Creating account...') : locale == 'ru' ? 'Зарегистрироваться' : 'Register'}</button>
      </form>
      <Link href='/login' className='mt-4 text-sm text-slate-600 underline'>{locale == 'ru' ? 'Уже есть аккаунт' : 'Already have account'}</Link>
    </main>
  )
}

export default RegisterPage
