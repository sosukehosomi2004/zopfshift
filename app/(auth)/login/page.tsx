'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

const schema = z.object({
  employeeNumber: z.string().min(1, '社員番号を入力してください').max(20),
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
    <div className="w-full">
      {/* ロゴ: zopf 公式と同じ Kreon フォント */}
      <div className="flex flex-col items-center mb-10">
        <h1
          className="text-7xl tracking-wide text-[#5C3A1F] leading-none"
          style={{ fontFamily: 'var(--font-kreon)', fontWeight: 300 }}
        >
          zopf
        </h1>
        <div className="flex items-center gap-3 mt-2">
          <span className="h-px w-8 bg-[#A8845E]" />
          <p className="text-xs tracking-[0.3em] text-[#7A5A3F] uppercase">
            shift
          </p>
          <span className="h-px w-8 bg-[#A8845E]" />
        </div>
        <p className="text-xs text-[#9B7A5A] mt-3 tracking-wider">
          パン焼き小屋ツオップ シフト管理
        </p>
      </div>

      {/* カード */}
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-[#E8DCC4] p-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="block text-xs text-[#7A5A3F] mb-1.5 tracking-wider">
              社員番号
            </label>
            <input
              type="text"
              autoCapitalize="characters"
              autoComplete="username"
              placeholder="例: FF001"
              {...register('employeeNumber')}
              className="w-full h-11 px-4 text-sm bg-[#FAF6EE] border border-[#D4BC92] rounded-lg focus:outline-none focus:border-[#8B5A2B] focus:ring-2 focus:ring-[#8B5A2B]/20 transition-colors placeholder:text-[#B5A38A]"
            />
            {errors.employeeNumber && (
              <p className="text-xs text-red-500 mt-1">{errors.employeeNumber.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-[#7A5A3F] mb-1.5 tracking-wider">
              パスワード
            </label>
            <input
              type="password"
              placeholder="••••••••"
              {...register('password')}
              className="w-full h-11 px-4 text-sm bg-[#FAF6EE] border border-[#D4BC92] rounded-lg focus:outline-none focus:border-[#8B5A2B] focus:ring-2 focus:ring-[#8B5A2B]/20 transition-colors placeholder:text-[#B5A38A]"
            />
            {errors.password && (
              <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-[#8B5A2B] hover:bg-[#704620] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 tracking-wider"
            style={{ fontFamily: 'var(--font-kreon)' }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#EFE3CB]">
          <p className="text-center text-xs text-[#9B7A5A] leading-relaxed">
            ログインできない方は<br />
            管理者へお問い合わせください
          </p>
        </div>
      </div>
    </div>
  )
}
