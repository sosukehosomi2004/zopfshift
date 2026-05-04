'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Save, Plus, Trash2 } from 'lucide-react'
import { eachDayOfInterval, format } from 'date-fns'
import { ja } from 'date-fns/locale'

type DayOverride = { capacity?: number; blocked?: boolean }
type ConsecBlock = { startDate: string; endDate: string }

type RequestWindow = {
  id: string
  fiscalYear: number
  month: number
  deadline: string
  weekdayCapacity: number
  holidayCapacity: number
  dayOverrides: Record<string, DayOverride>
  consecutiveBlocks: ConsecBlock[]
}

type Props = {
  window: RequestWindow
  onClose: () => void
  onSaved: () => void
}

function periodRange(fiscalYear: number, month: number) {
  const startMonth = month === 1 ? 12 : month - 1
  const startYear = month === 1 ? fiscalYear - 1 : fiscalYear
  return {
    start: new Date(`${startYear}-${String(startMonth).padStart(2, '0')}-21T00:00:00`),
    end: new Date(`${fiscalYear}-${String(month).padStart(2, '0')}-20T00:00:00`),
  }
}

export function RequestWindowEditModal({ window: w, onClose, onSaved }: Props) {
  const [weekdayCapacity, setWeekdayCapacity] = useState(w.weekdayCapacity)
  const [holidayCapacity, setHolidayCapacity] = useState(w.holidayCapacity)
  const [dayOverrides, setDayOverrides] = useState<Record<string, DayOverride>>(w.dayOverrides ?? {})
  const [consecutiveBlocks, setConsecutiveBlocks] = useState<ConsecBlock[]>(w.consecutiveBlocks ?? [])
  const [newBlockStart, setNewBlockStart] = useState('')
  const [newBlockEnd, setNewBlockEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set())
  const [counts, setCounts] = useState<Record<string, number>>({}) // 日付別の現在の申請数

  const range = useMemo(() => periodRange(w.fiscalYear, w.month), [w.fiscalYear, w.month])
  const days = useMemo(() => eachDayOfInterval({ start: range.start, end: range.end }), [range])

  useEffect(() => {
    // 祝日とその期間の申請数を取得
    const startStr = format(range.start, 'yyyy-MM-dd')
    const endStr = format(range.end, 'yyyy-MM-dd')
    fetch(`/api/holidays?year=${w.fiscalYear}`).then((r) => r.json()).then((arr: { date: string }[]) => {
      setHolidaySet(new Set(arr.map((h) => h.date.split('T')[0])))
    }).catch(() => {})
    fetch(`/api/day-off-requests?startDate=${startStr}&endDate=${endStr}`).then((r) => r.json()).then((arr: { date: string; status: string }[]) => {
      const map: Record<string, number> = {}
      for (const r of arr) {
        if (r.status === 'PENDING' || r.status === 'APPROVED') {
          const d = r.date.split('T')[0]
          map[d] = (map[d] ?? 0) + 1
        }
      }
      setCounts(map)
    }).catch(() => {})
  }, [w.fiscalYear, range])

  const isHolidayLike = (date: Date): boolean => {
    const dow = date.getDay()
    if (dow === 0 || dow === 6) return true
    return holidaySet.has(format(date, 'yyyy-MM-dd'))
  }

  const updateDayOverride = (dateStr: string, patch: Partial<DayOverride>) => {
    setDayOverrides((prev) => {
      const cur = prev[dateStr] ?? {}
      const next = { ...cur, ...patch }
      // 全部空ならエントリ削除
      if (next.capacity === undefined && !next.blocked) {
        const copy = { ...prev }
        delete copy[dateStr]
        return copy
      }
      return { ...prev, [dateStr]: next }
    })
  }

  const handleAddBlock = () => {
    if (!newBlockStart || !newBlockEnd) return
    if (newBlockEnd < newBlockStart) {
      alert('開始日は終了日より前にしてください')
      return
    }
    setConsecutiveBlocks((prev) => [...prev, { startDate: newBlockStart, endDate: newBlockEnd }])
    setNewBlockStart('')
    setNewBlockEnd('')
  }

  const handleRemoveBlock = (idx: number) => {
    setConsecutiveBlocks((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    setSaving(true)
    const res = await fetch(`/api/request-windows/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weekdayCapacity, holidayCapacity, dayOverrides, consecutiveBlocks,
      }),
    })
    setSaving(false)
    if (res.ok) {
      onSaved()
      onClose()
    } else {
      alert('保存に失敗しました')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">{w.fiscalYear}年{w.month}月度 - 申請制限の設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {/* キャパシティ既定値 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">既定の上限人数</h3>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 text-sm">
                平日:
                <input type="number" min={0} max={99} value={weekdayCapacity}
                  onChange={(e) => setWeekdayCapacity(Number(e.target.value))}
                  className="w-16 px-2 py-1 border rounded" />
                名まで
              </label>
              <label className="flex items-center gap-2 text-sm">
                休日 (土日祝):
                <input type="number" min={0} max={99} value={holidayCapacity}
                  onChange={(e) => setHolidayCapacity(Number(e.target.value))}
                  className="w-16 px-2 py-1 border rounded" />
                名まで
              </label>
            </div>
          </section>

          {/* 連続禁止範囲 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">連続申請禁止範囲</h3>
            <p className="text-xs text-gray-500 mb-2">指定範囲内で同一従業員が連日休み申請するのを禁止します</p>
            <div className="space-y-1 mb-3">
              {consecutiveBlocks.length === 0 && (
                <p className="text-xs text-gray-400">設定なし</p>
              )}
              {consecutiveBlocks.map((b, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded text-sm">
                  <span>{b.startDate} 〜 {b.endDate}</span>
                  <button onClick={() => handleRemoveBlock(i)} className="ml-auto text-red-500 hover:text-red-700">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <input type="date" value={newBlockStart} onChange={(e) => setNewBlockStart(e.target.value)}
                min={format(range.start, 'yyyy-MM-dd')} max={format(range.end, 'yyyy-MM-dd')}
                className="px-2 py-1 border rounded text-sm" />
              <span className="text-sm">〜</span>
              <input type="date" value={newBlockEnd} onChange={(e) => setNewBlockEnd(e.target.value)}
                min={format(range.start, 'yyyy-MM-dd')} max={format(range.end, 'yyyy-MM-dd')}
                className="px-2 py-1 border rounded text-sm" />
              <button onClick={handleAddBlock}
                className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded hover:bg-amber-600 inline-flex items-center gap-1">
                <Plus className="w-3 h-3" />
                追加
              </button>
            </div>
          </section>

          {/* 日別上書き */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">日別の上書き</h3>
            <p className="text-xs text-gray-500 mb-2">特定日の上限を変更したり、申請不可にしたりできます</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">日付</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">既定</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">上限上書き</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">申請不可</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">現在の申請</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const ds = format(d, 'yyyy-MM-dd')
                    const ov = dayOverrides[ds] ?? {}
                    const isHol = isHolidayLike(d)
                    const baseCapacity = isHol ? holidayCapacity : weekdayCapacity
                    const effective = ov.capacity ?? baseCapacity
                    const cnt = counts[ds] ?? 0
                    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
                    return (
                      <tr key={ds} className={`border-b border-gray-100 ${ov.blocked ? 'bg-red-50/50' : ''}`}>
                        <td className="px-2 py-1.5 font-mono text-gray-700">
                          {format(d, 'M/d')} ({dow}){isHol && d.getDay() !== 0 && d.getDay() !== 6 ? '祝' : ''}
                        </td>
                        <td className="px-2 py-1.5 text-gray-500">
                          {isHol ? '休日' : '平日'} ({baseCapacity})
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min={0} max={99}
                            value={ov.capacity ?? ''}
                            onChange={(e) => updateDayOverride(ds, { capacity: e.target.value === '' ? undefined : Number(e.target.value) })}
                            placeholder="-"
                            className="w-14 px-1 py-0.5 border rounded text-center" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="checkbox" checked={!!ov.blocked}
                            onChange={(e) => updateDayOverride(ds, { blocked: e.target.checked })}
                            className="accent-red-500" />
                        </td>
                        <td className={`px-2 py-1.5 ${cnt >= effective ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {cnt}/{effective}
                          {cnt >= effective && <span className="ml-1 text-[10px]">(満員)</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#0AB4CC] text-white rounded-lg hover:bg-[#099bb0] disabled:opacity-50">
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
