'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CalendarDays } from 'lucide-react'
import Link from 'next/link'

const schema = z.object({
  name: z.string().min(1, '名前を入力してください'),
  email: z.string().email('正しいメールアドレスを入力してください'),
  password: z.string().min(6, 'パスワードは6文字以上です'),
})

type FormData = z.infer<typeof schema>

export default function SignupPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setLoading(false)
    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? '登録に失敗しました')
    } else {
      router.push('/login')
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center mb-8">
        <div className="w-10 h-10 rounded-xl bg-[#0AB4CC] flex items-center justify-center mb-3">
          <CalendarDays className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-[#1A202C]">ShiftApp</h1>
        <p className="text-sm text-[#718096] mt-1">新規アカウント登録</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">名前</Label>
            <Input id="name" placeholder="山田 太郎" {...register('name')} />
            {errors.name && <p className="text-xs text-[#EF4444]">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">メールアドレス</Label>
            <Input id="email" type="email" placeholder="you@example.com" {...register('email')} />
            {errors.email && <p className="text-xs text-[#EF4444]">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">パスワード</Label>
            <Input id="password" type="password" placeholder="••••••••" {...register('password')} />
            {errors.password && <p className="text-xs text-[#EF4444]">{errors.password.message}</p>}
          </div>

          {error && (
            <p className="text-xs text-[#EF4444] bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="w-full bg-[#0AB4CC] hover:bg-[#0099B0] text-white">
            {loading ? '登録中...' : 'アカウント作成'}
          </Button>
        </form>

        <p className="text-center text-sm text-[#718096] mt-4">
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-[#0AB4CC] hover:underline">ログイン</Link>
        </p>
      </div>
    </div>
  )
}
