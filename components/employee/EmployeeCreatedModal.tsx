'use client'

import { useState } from 'react'
import { CheckCircle, Copy, X } from 'lucide-react'

type Props = {
  employeeNumber: number
  lastName: string
  firstName: string
  initialPassword: string
  onClose: () => void
}

export function EmployeeCreatedModal({ employeeNumber, lastName, firstName, initialPassword, onClose }: Props) {
  const [copied, setCopied] = useState<'pw' | 'all' | null>(null)

  const copy = async (text: string, kind: 'pw' | 'all') => {
    await navigator.clipboard.writeText(text)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1500)
  }

  const allText = `社員番号: ${employeeNumber}\n初期パスワード: ${initialPassword}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b bg-green-50">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-green-800">登録完了</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{lastName} {firstName}</span> さんを登録しました。
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">社員番号</span>
              <code className="font-mono text-base text-gray-900 font-semibold">{employeeNumber}</code>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-xs text-gray-500">初期パスワード</span>
              <div className="flex items-center gap-2">
                <code className="font-mono text-base text-gray-900 font-semibold">{initialPassword}</code>
                <button
                  type="button"
                  onClick={() => copy(initialPassword, 'pw')}
                  className="text-xs px-2 py-1 rounded bg-white border hover:bg-gray-100 text-gray-600 inline-flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {copied === 'pw' ? 'コピー済' : 'コピー'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">⚠ この画面でしか初期パスワードを確認できません</p>
            <p>必ずこの場でメモ/コピーして従業員に伝達してください。</p>
            <p>従業員の初回ログイン時に、自動でパスワード変更画面に誘導されます。</p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => copy(allText, 'all')}
              className="flex-1 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg inline-flex items-center justify-center gap-1"
            >
              <Copy className="w-4 h-4" />
              {copied === 'all' ? 'コピー済' : '社員番号+パスワードをコピー'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm bg-[#0AB4CC] text-white rounded-lg hover:bg-[#099bb0]"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
