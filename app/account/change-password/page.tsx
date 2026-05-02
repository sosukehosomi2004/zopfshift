'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { KeyRound, Eye, EyeOff, LogOut } from 'lucide-react'

export default function ForceChangePasswordPage() {
  const router = useRouter()
  const { update } = useSession()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('新しいパスワードと確認用パスワードが一致しません')
      return
    }
    if (newPassword.length < 6) {
      setError('パスワードは6文字以上で入力してください')
      return
    }
    if (currentPassword === newPassword) {
      setError('初期パスワードと異なるものを設定してください')
      return
    }

    setSaving(true)
    const res = await fetch('/api/me/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    setSaving(false)

    if (res.ok) {
      // セッションのフラグを即時クリアしてリダイレクト先で詰まらないように
      await update({ mustChangePassword: false })
      router.push('/')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      const errMsg =
        typeof data.error === 'string'
          ? data.error
          : Object.values(data.error ?? {})
              .flat()
              .join(' / ') || 'パスワード変更に失敗しました'
      setError(errMsg)
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b bg-amber-50 flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-amber-700" />
          <h1 className="text-lg font-semibold text-amber-800">初回パスワード変更</h1>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-700">
            セキュリティ向上のため、初期パスワードから新しいパスワードに変更してください。
          </p>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">現在のパスワード (初期パスワード)</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20 focus:border-[#0AB4CC]"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">新しいパスワード</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20 focus:border-[#0AB4CC]"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">6文字以上</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">新しいパスワード (確認)</label>
            <input
              type={showNew ? 'text' : 'password'}
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20 focus:border-[#0AB4CC]"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2 bg-[#0AB4CC] text-white rounded-lg hover:bg-[#099bb0] text-sm font-medium disabled:opacity-50"
          >
            {saving ? '変更中...' : 'パスワードを変更して続ける'}
          </button>

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 inline-flex items-center justify-center gap-1"
          >
            <LogOut className="w-3 h-3" />
            ログアウト
          </button>
        </form>
      </div>
    </div>
  )
}
