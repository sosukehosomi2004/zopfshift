'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

type Employee = {
  id: string
  lastName: string
  firstName: string
  lastNameRomaji: string
  firstNameRomaji: string
  email: string
  employmentType: string
  primaryWorkplace: string
  secondaryWorkplaces: { workplace: string }[]
  availableShiftTimes: { timeSlot: string }[]
}

type Props = {
  employee: Employee | null
  onClose: () => void
  onSaved: () => void
}

const WORKPLACES = ['FACTORY', 'CAFE', 'FLOOR', 'OFFICE', 'OTHER'] as const
const WORKPLACE_LABELS: Record<string, string> = {
  FACTORY: '工場',
  CAFE: 'カフェ',
  FLOOR: 'フロア',
  OFFICE: '事務',
  OTHER: 'その他',
}

const SHIFT_TIME_LABELS: Record<string, string> = {
  EARLY: '早番',
  DAYTIME: '日中',
  CLOSE: 'クローズ',
}

export function EmployeeFormModal({ employee, onClose, onSaved }: Props) {
  const isEdit = !!employee

  const [lastName, setLastName] = useState(employee?.lastName ?? '')
  const [firstName, setFirstName] = useState(employee?.firstName ?? '')
  const [lastNameRomaji, setLastNameRomaji] = useState(employee?.lastNameRomaji ?? '')
  const [firstNameRomaji, setFirstNameRomaji] = useState(employee?.firstNameRomaji ?? '')
  const [email, setEmail] = useState(employee?.email ?? '')
  const [password, setPassword] = useState('')
  const [employmentType, setEmploymentType] = useState(employee?.employmentType ?? 'FULL_TIME')
  const [primaryWorkplace, setPrimaryWorkplace] = useState(employee?.primaryWorkplace ?? 'FACTORY')
  const [secondaryWorkplaces, setSecondaryWorkplaces] = useState<string[]>(
    employee?.secondaryWorkplaces.map((sw) => sw.workplace) ?? []
  )
  const [availableShiftTimes, setAvailableShiftTimes] = useState<string[]>(
    employee?.availableShiftTimes.map((st) => st.timeSlot) ?? []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleSecondary = (wp: string) => {
    setSecondaryWorkplaces((prev) =>
      prev.includes(wp) ? prev.filter((w) => w !== wp) : [...prev, wp]
    )
  }

  const toggleShiftTime = (st: string) => {
    setAvailableShiftTimes((prev) =>
      prev.includes(st) ? prev.filter((t) => t !== st) : [...prev, st]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const body: Record<string, unknown> = {
      lastName,
      firstName,
      lastNameRomaji,
      firstNameRomaji,
      employmentType,
      primaryWorkplace,
      secondaryWorkplaces: secondaryWorkplaces.filter((w) => w !== primaryWorkplace),
      availableShiftTimes: employmentType === 'PART_TIME' ? availableShiftTimes : undefined,
    }

    if (!isEdit) {
      body.email = email
      body.password = password
    }

    const url = isEdit ? `/api/employees/${employee.id}` : '/api/employees'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error?.toString() ?? '保存に失敗しました')
      setSaving(false)
      return
    }

    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">
            {isEdit ? '従業員を編集' : '従業員を追加'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded">{error}</div>
          )}

          {/* 名前 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">姓（漢字）</label>
              <input required value={lastName} onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">名（漢字）</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">姓（ローマ字）</label>
              <input required value={lastNameRomaji} onChange={(e) => setLastNameRomaji(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">名（ローマ字）</label>
              <input value={firstNameRomaji} onChange={(e) => setFirstNameRomaji(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20" />
            </div>
          </div>

          {/* 認証情報（新規のみ） */}
          {!isEdit && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">メールアドレス</label>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">パスワード</label>
                <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20" />
              </div>
            </>
          )}

          {/* 雇用形態 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">雇用形態</label>
            <div className="flex gap-3">
              {(['FULL_TIME', 'PART_TIME'] as const).map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="employmentType" value={type}
                    checked={employmentType === type}
                    onChange={() => setEmploymentType(type)}
                    className="accent-[#0AB4CC]" />
                  <span className="text-sm">{type === 'FULL_TIME' ? '正社員' : 'パート'}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 基本勤務場所 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">基本勤務場所</label>
            <select value={primaryWorkplace} onChange={(e) => setPrimaryWorkplace(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20">
              {WORKPLACES.map((wp) => (
                <option key={wp} value={wp}>{WORKPLACE_LABELS[wp]}</option>
              ))}
            </select>
            {primaryWorkplace === 'FACTORY' && employmentType === 'PART_TIME' && (
              <p className="text-xs text-red-500 mt-1">工場は正社員のみ配置可能です</p>
            )}
          </div>

          {/* 移動可能な勤務場所 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">移動可能な勤務場所</label>
            <div className="flex gap-2 flex-wrap">
              {WORKPLACES.filter((wp) => wp !== primaryWorkplace).map((wp) => {
                // パートは工場に移動不可
                if (employmentType === 'PART_TIME' && wp === 'FACTORY') return null
                return (
                  <label key={wp} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={secondaryWorkplaces.includes(wp)}
                      onChange={() => toggleSecondary(wp)}
                      className="accent-[#0AB4CC] w-3.5 h-3.5" />
                    <span className="text-sm">{WORKPLACE_LABELS[wp]}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* パートの時間帯（パートのみ） */}
          {employmentType === 'PART_TIME' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">対応可能な勤務時間帯</label>
              <div className="flex gap-3">
                {(['EARLY', 'DAYTIME', 'CLOSE'] as const).map((st) => (
                  <label key={st} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={availableShiftTimes.includes(st)}
                      onChange={() => toggleShiftTime(st)}
                      className="accent-[#0AB4CC] w-3.5 h-3.5" />
                    <span className="text-sm">{SHIFT_TIME_LABELS[st]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              キャンセル
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm bg-[#0AB4CC] text-white rounded-lg hover:bg-[#099bb0] disabled:opacity-50">
              {saving ? '保存中...' : isEdit ? '更新' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
