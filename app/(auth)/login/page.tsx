'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

const schema = z.object({
  employeeNumber: z.string().regex(/^\d+$/, '社員番号は数字で入力してください').min(1, '社員番号を入力してください'),
  password: z.string().min(6, 'パスワードは6文字以上です'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setError('')
    const res = await signIn('credentials', {
      employeeNumber: data.employeeNumber,
      password: data.password,
      redirect: false,
    })
    setLoading(false)
    if (res?.error) {
      setError('社員番号またはパスワードが正しくありません')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="flex items-center gap-2 mb-1">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M14 2L26 8V20L14 26L2 20V8L14 2Z" fill="#0AB4CC" />
            <path d="M14 2L26 8V20L14 26L2 20V8L14 2Z" fill="url(#g)" opacity="0.3"/>
            <defs>
              <linearGradient id="g" x1="2" y1="2" x2="26" y2="26">
                <stop stopColor="white"/>
                <stop offset="1" stopColor="#0AB4CC" stopOpacity="0"/>
              </linearGradient>
            </defs>
          </svg>
          <span className="text-2xl font-bold text-[#0AB4CC] tracking-tight">ShiftApp</span>
        </div>
        <p className="text-sm text-[#888]">シフト管理サービス</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-[#E0E0E0] p-8">
        <h2 className="text-base font-semibold text-[#333] text-center mb-6">
          アカウントにログイン
        </h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <input
              type="number"
              inputMode="numeric"
              placeholder="社員番号"
              {...register('employeeNumber')}
              className="w-full h-10 px-3 text-sm border border-[#CCCCCC] rounded focus:outline-none focus:border-[#0AB4CC] focus:ring-1 focus:ring-[#0AB4CC] transition-colors placeholder:text-[#AAAAAA]"
            />
            {errors.employeeNumber && (
              <p className="text-xs text-red-500 mt-1">{errors.employeeNumber.message}</p>
            )}
          </div>

          <div>
            <input
              type="password"
              placeholder="パスワード"
              {...register('password')}
              className="w-full h-10 px-3 text-sm border border-[#CCCCCC] rounded focus:outline-none focus:border-[#0AB4CC] focus:ring-1 focus:ring-[#0AB4CC] transition-colors placeholder:text-[#AAAAAA]"
            />
            {errors.password && (
              <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 bg-[#0AB4CC] hover:bg-[#0099B0] text-white text-sm font-semibold rounded transition-colors disabled:opacity-60"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p className="text-center text-xs text-[#888] mt-5">
          ログインできない方は管理者へお問い合わせください
        </p>
      </div>
    </div>
  )
}
