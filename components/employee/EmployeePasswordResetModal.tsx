'use client'

import { useState } from 'react'
import { X, KeyRound, Eye, EyeOff, RefreshCw } from 'lucide-react'

type Employee = {
  id: string
  employeeNumber: number
  lastName: string
  firstName: string
}

type Props = {
  employee: Employee
  onClose: () => void
}

// 強めのランダムパスワード生成 (英大文字/小文字/数字を1つ以上含む8文字)
function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // I/O 除外
  const lower = 'abcdefghijkmnpqrstuvwxyz' // l/o 除外
  const digit = '23456789' // 0/1 除外
  const all = upper + lower + digit
  const arr: string[] = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digit[Math.floor(Math.random() * digit.length)],
  ]
  for (let i = 0; i < 5; i++) arr.push(all[Math.floor(Math.random() * all.length)])
  // シャッフル
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.join('')
}

export function EmployeePasswordResetModal({ employee, onClose }: Props) {
  const [newPassword, setNewPassword] = useState('')
  const [show, setShow] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleGenerate = () => {
    setNewPassword(generatePassword())
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      setError('パスワードは6文字以上で入力してください')
      return
    }
    if (!confirm(`${employee.lastName} ${employee.firstName} のパスワードをリセットします。\n\n新パスワード: ${newPassword}\n\nこの内容で実行してよろしいですか？`)) return

    setSaving(true)
    setError('')
    const res = await fetch(`/api/employees/${employee.id}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword }),
    })
    setSaving(false)
    if (res.ok) {
      setDone(true)
    } else {
      const data = await res.json().catch(() => ({}))
      const errMsg =
        typeof data.error === 'string'
          ? data.error
          : Object.values(data.error ?? {})
              .flat()
              .join(' / ') || 'リセットに失敗しました'
      setError(errMsg)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(newPassword)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b bg-amber-50">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-700" />
            <h2 className="text-lg font-semibold text-amber-800">パスワードリセット</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="font-semibold text-gray-900">
              {employee.lastName} {employee.firstName}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">社員番号 {employee.employeeNumber}</div>
          </div>

          {done ? (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-green-800 mb-2">✓ パスワードをリセットしました</p>
                <p className="text-xs text-green-700 mb-2">以下のパスワードを従業員へ伝達してください：</p>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 bg-white border border-green-300 rounded px-3 py-2 font-mono text-sm break-all">
                    {newPassword}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-xs px-3 py-2 rounded bg-green-100 hover:bg-green-200 text-green-700"
                  >
                    コピー
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                ※ 従業員には、ログイン後に「アカウント設定」から自分でパスワードを変更するように伝えてください。
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 bg-[#0AB4CC] text-white rounded-lg hover:bg-[#099bb0] text-sm font-medium"
              >
                閉じる
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-500">新しいパスワード</label>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    className="flex items-center gap-1 text-xs text-[#0AB4CC] hover:text-[#099bb0]"
                  >
                    <RefreshCw className="w-3 h-3" />
                    自動生成
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="6文字以上"
                    className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20 focus:border-[#0AB4CC]"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  リセット後はこの画面でしかパスワードを確認できません
                </p>
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={saving || newPassword.length < 6}
                  className="flex-1 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40"
                >
                  {saving ? 'リセット中...' : 'パスワードをリセット'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
