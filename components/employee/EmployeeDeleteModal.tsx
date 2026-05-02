'use client'

import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'

type Employee = {
  id: string
  lastName: string
  firstName: string
  primaryWorkplace: string
  employmentType: string
}

type Props = {
  employee: Employee
  onClose: () => void
  onDeleted: () => void
}

export function EmployeeDeleteModal({ employee, onClose, onDeleted }: Props) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const fullName = `${employee.lastName} ${employee.firstName}`
  const expected = `${employee.lastName}${employee.firstName}`

  const canDelete = acknowledged && confirmText.replace(/\s/g, '') === expected

  const handleDelete = async () => {
    if (!canDelete) return
    setDeleting(true)
    const res = await fetch(`/api/employees/${employee.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) {
      onDeleted()
      onClose()
    } else {
      alert('削除に失敗しました')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-red-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-semibold text-red-700">従業員の削除</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="font-semibold text-gray-900">{fullName}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {employee.primaryWorkplace} ・{' '}
              {employee.employmentType === 'FULL_TIME' ? '正社員' : 'パート'}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              この操作で起こること
            </h3>
            <ul className="space-y-1.5 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-red-500">•</span>
                <span>従業員一覧から非表示になります</span>
              </li>
              <li className="flex gap-2">
                <span className="text-red-500">•</span>
                <span>今後のシフト生成・配置候補から除外されます</span>
              </li>
              <li className="flex gap-2">
                <span className="text-red-500">•</span>
                <span>登録済みの通年ルール・スキル・休み申請は残ります</span>
              </li>
              <li className="flex gap-2">
                <span className="text-red-500">•</span>
                <span>過去の確定シフト履歴は保持されます</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600">⚠</span>
                <span className="text-amber-700">
                  同じメールアドレスでの再登録はできなくなります
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600">⚠</span>
                <span className="text-amber-700">
                  画面上から復活させる機能は現状ありません
                </span>
              </li>
            </ul>
          </div>

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
            />
            <span className="text-sm text-gray-700">
              上記の内容を理解しました
            </span>
          </label>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              確認のため <span className="font-mono font-semibold text-gray-900">{expected}</span> と入力してください
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={!acknowledged}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 disabled:bg-gray-50"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            キャンセル
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? '削除中...' : '削除する'}
          </button>
        </div>
      </div>
    </div>
  )
}
