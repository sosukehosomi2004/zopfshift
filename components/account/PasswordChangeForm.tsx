'use client'

import { useState } from 'react'
import { Save, Eye, EyeOff } from 'lucide-react'

export function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '新しいパスワードと確認用パスワードが一致しません' })
      return
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'パスワードは6文字以上で入力してください' })
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
      setMessage({ type: 'success', text: 'パスワードを変更しました' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } else {
      const data = await res.json().catch(() => ({}))
      const errMsg =
        typeof data.error === 'string'
          ? data.error
          : Object.values(data.error ?? {})
              .flat()
              .join(' / ') || 'パスワード変更に失敗しました'
      setMessage({ type: 'error', text: errMsg })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">現在のパスワード</label>
        <div className="relative">
          <input
            type={showCurrent ? 'text' : 'password'}
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20 focus:border-[#0AB4CC]"
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

      {message && (
        <div
          className={`text-sm px-3 py-2 rounded ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-2 bg-[#0AB4CC] text-white px-4 py-2 rounded-lg hover:bg-[#099bb0] text-sm font-medium disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {saving ? '変更中...' : 'パスワードを変更'}
      </button>
    </form>
  )
}
