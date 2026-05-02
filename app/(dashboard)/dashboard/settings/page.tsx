'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Plus, Trash2 } from 'lucide-react'
import { PasswordChangeForm } from '@/components/account/PasswordChangeForm'
import { StaffingRulesEditor } from '@/components/settings/StaffingRulesEditor'
import { RulesOverview } from '@/components/settings/RulesOverview'

type MonthConfig = { month: number; holidayCount: number }
type Holiday = { id: string; date: string; name: string }

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

export default function SettingsPage() {
  const currentYear = new Date().getFullYear()
  const [fiscalYear, setFiscalYear] = useState(currentYear)
  const [months, setMonths] = useState<MonthConfig[]>([])
  const [holidayYear, setHolidayYear] = useState(currentYear)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayName, setNewHolidayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const fetchHolidayConfig = useCallback(async () => {
    const res = await fetch(`/api/holiday-config?fiscalYear=${fiscalYear}`)
    const data = await res.json()
    if (data.months?.length > 0) {
      setMonths(data.months.map((m: MonthConfig & { id?: string }) => ({ month: m.month, holidayCount: m.holidayCount })))
    } else {
      setMonths(Array.from({ length: 12 }, (_, i) => ({ month: i + 1, holidayCount: 8 })))
    }
  }, [fiscalYear])

  const fetchHolidays = useCallback(async () => {
    const res = await fetch(`/api/holidays?year=${holidayYear}`)
    const data = await res.json()
    setHolidays(data)
  }, [holidayYear])

  useEffect(() => { fetchHolidayConfig() }, [fetchHolidayConfig])
  useEffect(() => { fetchHolidays() }, [fetchHolidays])

  const updateMonthCount = (month: number, count: number) => {
    setMonths((prev) => prev.map((m) => m.month === month ? { ...m, holidayCount: count } : m))
  }

  const saveHolidayConfig = async () => {
    setSaving(true)
    setMessage('')
    await fetch('/api/holiday-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fiscalYear, months }),
    })
    setMessage('公休数を保存しました')
    setSaving(false)
    setTimeout(() => setMessage(''), 3000)
  }

  const addHoliday = async () => {
    if (!newHolidayDate || !newHolidayName) return
    await fetch('/api/holidays', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holidays: [{ date: newHolidayDate, name: newHolidayName }] }),
    })
    setNewHolidayDate('')
    setNewHolidayName('')
    fetchHolidays()
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">設定</h1>

      {message && (
        <div className="bg-green-50 text-green-700 text-sm px-4 py-2 rounded-lg mb-4">{message}</div>
      )}

      {/* 公休数設定 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">公休数設定</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setFiscalYear((y) => y - 1)} className="px-2 py-1 text-sm border rounded hover:bg-gray-50">&lt;</button>
            <span className="text-sm font-medium min-w-[60px] text-center">{fiscalYear}年度</span>
            <button onClick={() => setFiscalYear((y) => y + 1)} className="px-2 py-1 text-sm border rounded hover:bg-gray-50">&gt;</button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-4">各月のシフト期間（21日〜翌20日）における公休日数を設定します</p>

        <div className="grid grid-cols-4 gap-3 mb-4">
          {months.map((m) => (
            <div key={m.month} className="flex items-center gap-2">
              <label className="text-sm text-gray-600 w-10">{MONTH_LABELS[m.month - 1]}</label>
              <input
                type="number"
                min={0}
                max={20}
                value={m.holidayCount}
                onChange={(e) => updateMonthCount(m.month, parseInt(e.target.value) || 0)}
                className="w-16 px-2 py-1.5 border rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20"
              />
              <span className="text-xs text-gray-400">日</span>
            </div>
          ))}
        </div>

        <button
          onClick={saveHolidayConfig}
          disabled={saving}
          className="flex items-center gap-2 bg-[#0AB4CC] text-white px-4 py-2 rounded-lg hover:bg-[#099bb0] text-sm font-medium disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? '保存中...' : '保存'}
        </button>
      </section>

      {/* 祝日管理 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">祝日管理</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setHolidayYear((y) => y - 1)} className="px-2 py-1 text-sm border rounded hover:bg-gray-50">&lt;</button>
            <span className="text-sm font-medium min-w-[60px] text-center">{holidayYear}年</span>
            <button onClick={() => setHolidayYear((y) => y + 1)} className="px-2 py-1 text-sm border rounded hover:bg-gray-50">&gt;</button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-4">祝日はシフト生成時に「休日」として扱われます</p>

        {/* 自動取得ボタン */}
        <button
          onClick={async () => {
            const res = await fetch('/api/holidays', { method: 'POST' })
            const data = await res.json()
            if (res.ok) {
              alert(`${data.count}件の祝日を取得しました`)
              fetchHolidays()
            } else {
              alert('祝日取得に失敗しました')
            }
          }}
          className="mb-4 bg-[#0AB4CC] text-white px-4 py-2 rounded-lg hover:bg-[#099bb0] text-sm font-medium"
        >
          祝日を自動取得（日本の祝日）
        </button>

        {/* 追加フォーム */}
        <div className="flex gap-2 mb-4">
          <input
            type="date"
            value={newHolidayDate}
            onChange={(e) => setNewHolidayDate(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20"
          />
          <input
            type="text"
            placeholder="祝日名"
            value={newHolidayName}
            onChange={(e) => setNewHolidayName(e.target.value)}
            className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20"
          />
          <button
            onClick={addHoliday}
            className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            追加
          </button>
        </div>

        {/* 祝日リスト */}
        {holidays.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">{holidayYear}年の祝日が登録されていません</p>
        ) : (
          <div className="space-y-1">
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500 font-mono">{h.date.split('T')[0]}</span>
                  <span className="text-sm text-gray-900">{h.name}</span>
                </div>
                <button className="text-gray-400 hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-semibold mb-3">シフト生成ルール (稼働人数)</h2>
        <StaffingRulesEditor />
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-semibold mb-3">シフト生成ルール (一覧)</h2>
        <RulesOverview />
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-semibold">自分のパスワード変更</h2>
        <p className="text-xs text-gray-400 mb-3">ログイン中のアカウント (あなた) のパスワードを変更します。<br />他の従業員のパスワードをリセットするには「従業員管理」→ 編集 →「パスワードをリセット」をご利用ください。</p>
        <PasswordChangeForm />
      </section>
    </div>
  )
}
