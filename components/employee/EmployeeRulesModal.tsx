'use client'

import { useEffect, useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'

type Employee = {
  id: string
  lastName: string
  firstName: string
  primaryWorkplace: string
  secondaryWorkplaces: { workplace: string }[]
}

type DayCategory = 'HOLIDAY' | 'WEEKEND_OR_HOLIDAY' | 'WEEKDAY'

type Rule = {
  id: string
  dayOfWeek: number | null
  dayCategory: DayCategory | null
  excludeHolidays: boolean | null
  ruleType: 'ALWAYS_OFF' | 'ALWAYS_WORK'
  workplace: string | null
  memo: string | null
}

const CATEGORY_LABELS: Record<DayCategory, string> = {
  HOLIDAY: '祝日',
  WEEKEND_OR_HOLIDAY: '休日 (土日+祝日)',
  WEEKDAY: '平日 (月-金, 祝日除く)',
}

type Props = {
  employee: Employee
  onClose: () => void
}

const WORKPLACE_LABELS: Record<string, string> = {
  FACTORY: '工場',
  CAFE: 'カフェ',
  FLOOR: 'フロア',
  OFFICE: '事務',
  OTHER: 'その他',
}

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export function EmployeeRulesModal({ employee, onClose }: Props) {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // フォーム
  const [conditionType, setConditionType] = useState<'dayOfWeek' | 'category'>('dayOfWeek')
  const [dayOfWeek, setDayOfWeek] = useState<number>(1)
  const [dayCategory, setDayCategory] = useState<DayCategory>('WEEKEND_OR_HOLIDAY')
  const [excludeHolidays, setExcludeHolidays] = useState<boolean>(true)
  const [ruleType, setRuleType] = useState<'ALWAYS_OFF' | 'ALWAYS_WORK'>('ALWAYS_OFF')
  const [workplace, setWorkplace] = useState<string>(employee.primaryWorkplace)
  const [memo, setMemo] = useState<string>('')

  const allowedWorkplaces = [
    employee.primaryWorkplace,
    ...employee.secondaryWorkplaces.map((sw) => sw.workplace),
  ]

  const fetchRules = async () => {
    setLoading(true)
    const res = await fetch(`/api/employees/${employee.id}/rules`)
    if (res.ok) setRules(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    fetchRules()
  }, [employee.id])

  const handleAdd = async () => {
    setSaving(true)
    const body: Record<string, unknown> = { ruleType, memo: memo || null }
    if (conditionType === 'dayOfWeek') {
      body.dayOfWeek = dayOfWeek
      body.excludeHolidays = excludeHolidays
    } else {
      body.dayCategory = dayCategory
    }
    if (ruleType === 'ALWAYS_WORK') {
      body.workplace = workplace
    }

    const res = await fetch(`/api/employees/${employee.id}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    setSaving(false)
    if (res.ok) {
      setMemo('')
      fetchRules()
    } else {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'ルール追加に失敗しました')
    }
  }

  const handleDelete = async (ruleId: string) => {
    if (!confirm('このルールを削除しますか？')) return
    await fetch(`/api/employees/${employee.id}/rules/${ruleId}`, { method: 'DELETE' })
    fetchRules()
  }

  const formatRule = (r: Rule): string => {
    let cond: string
    if (r.dayOfWeek !== null) {
      cond = `毎週${DOW_LABELS[r.dayOfWeek]}曜日`
      if (r.excludeHolidays === true) cond += ' (祝日除く)'
      else if (r.excludeHolidays === false) cond += ' (祝日含む)'
    } else if (r.dayCategory) {
      cond = CATEGORY_LABELS[r.dayCategory]
    } else {
      cond = '？'
    }
    const action =
      r.ruleType === 'ALWAYS_OFF'
        ? '休み'
        : `出勤 (${r.workplace ? WORKPLACE_LABELS[r.workplace] : '基本勤務地'})`
    return `${cond} → ${action}`
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <h3 className="font-semibold text-gray-900">通年固定ルール</h3>
            <p className="text-xs text-gray-400">
              {employee.lastName} {employee.firstName}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {/* 既存ルール一覧 */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 mb-2">登録済みルール</h4>
            {loading ? (
              <p className="text-sm text-gray-400">読み込み中...</p>
            ) : rules.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">ルールが登録されていません</p>
            ) : (
              <div className="space-y-1">
                {rules.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm"
                  >
                    <div>
                      <span className="text-gray-900">{formatRule(r)}</span>
                      {r.memo && <span className="ml-2 text-xs text-gray-400">{r.memo}</span>}
                    </div>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 新規追加フォーム */}
          <div className="border-t pt-4">
            <h4 className="text-xs font-medium text-gray-500 mb-2">ルールを追加</h4>
            <div className="space-y-3">
              {/* 条件 */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">条件</label>
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={conditionType}
                    onChange={(e) => setConditionType(e.target.value as 'dayOfWeek' | 'category')}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="dayOfWeek">曜日</option>
                    <option value="category">種別</option>
                  </select>
                  {conditionType === 'dayOfWeek' ? (
                    <select
                      value={dayOfWeek}
                      onChange={(e) => setDayOfWeek(Number(e.target.value))}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      {DOW_LABELS.map((label, i) => (
                        <option key={i} value={i}>
                          毎週{label}曜日
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={dayCategory}
                      onChange={(e) => setDayCategory(e.target.value as DayCategory)}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value="WEEKEND_OR_HOLIDAY">休日 (土日+祝日)</option>
                      <option value="WEEKDAY">平日 (月-金, 祝日除く)</option>
                      <option value="HOLIDAY">祝日のみ</option>
                    </select>
                  )}
                </div>
                {conditionType === 'dayOfWeek' && (
                  <div className="mt-2">
                    <label className="block text-xs text-gray-500 mb-1">指定曜日が祝日の場合</label>
                    <div className="flex gap-2">
                      <label className="flex-1 flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                        <input
                          type="radio"
                          name="excludeHolidays"
                          checked={excludeHolidays === true}
                          onChange={() => setExcludeHolidays(true)}
                          className="text-[#0AB4CC]"
                        />
                        <span>祝日は除く</span>
                      </label>
                      <label className="flex-1 flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                        <input
                          type="radio"
                          name="excludeHolidays"
                          checked={excludeHolidays === false}
                          onChange={() => setExcludeHolidays(false)}
                          className="text-[#0AB4CC]"
                        />
                        <span>祝日も含む</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* アクション */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">アクション</label>
                <div className="flex gap-2">
                  <select
                    value={ruleType}
                    onChange={(e) => setRuleType(e.target.value as 'ALWAYS_OFF' | 'ALWAYS_WORK')}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="ALWAYS_OFF">休み</option>
                    <option value="ALWAYS_WORK">出勤</option>
                  </select>
                  {ruleType === 'ALWAYS_WORK' && (
                    <select
                      value={workplace}
                      onChange={(e) => setWorkplace(e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      {allowedWorkplaces.map((wp) => (
                        <option key={wp} value={wp}>
                          {WORKPLACE_LABELS[wp]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* メモ */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">メモ (任意)</label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="理由など"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  maxLength={100}
                />
              </div>

              <button
                onClick={handleAdd}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-[#0AB4CC] text-white py-2 rounded-lg hover:bg-[#099bb0] text-sm font-medium disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                ルールを追加
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            ※ 登録したルールはシフト期間作成時に自動で事前確定セルに展開されます。<br />
            ※ シフト期間ページの「ルール再適用」ボタンでいつでも再適用できます。
          </p>
        </div>
      </div>
    </div>
  )
}
