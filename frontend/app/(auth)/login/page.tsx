'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Login1 } from '@/components/login1'
import { useAuth } from '@/context/auth-context'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/errors'

const LoginPage = () => {
  const router = useRouter()
  const { login } = useAuth()
  const { locale } = useLanguage()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setError('')
    setIsSubmitting(true)
    try {
      await login({ email, password })
      router.push('/workspace-shell')
    } catch (requestError) {
      const message = getErrorMessage(requestError, locale == 'ru' ? 'Ошибка входа' : 'Login failed')
      setError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleClick = () => {
    toast.error(locale == 'ru' ? 'Google OAuth будет подключен отдельно' : 'Google OAuth will be connected separately')
  }

  return (
    <Login1
      heading={locale == 'ru' ? 'Вход' : 'Login'}
      buttonText={locale == 'ru' ? 'Войти' : 'Login'}
      googleText={locale == 'ru' ? 'Войти через Google' : 'Sign in with Google'}
      email={email}
      password={password}
      error={error}
      isSubmitting={isSubmitting}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={() => void handleSubmit()}
      onGoogleClick={handleGoogleClick}
    />
  )
}

export default LoginPage
