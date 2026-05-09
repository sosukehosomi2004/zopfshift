'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Save, Plus, Trash2, MessageSquare } from 'lucide-react'
import { eachDayOfInterval, format } from 'date-fns'

type Message = { startDate: string; endDate: string; body: string }

type RequestWindow = {
  id: string
  fiscalYear: number
  month: number
  deadline: string
  weekdayCapacity: number
  holidayCapacity: number
  thresholdOverrides: Record<string, number>
  messages: Message[]
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
  const [thresholdOverrides, setThresholdOverrides] = useState<Record<string, number>>(w.thresholdOverrides ?? {})
  const [messages, setMessages] = useState<Message[]>(w.messages ?? [])
  const [newMsgStart, setNewMsgStart] = useState('')
  const [newMsgEnd, setNewMsgEnd] = useState('')
  const [newMsgBody, setNewMsgBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set())
  const [counts, setCounts] = useState<Record<string, number>>({})

  const range = useMemo(() => periodRange(w.fiscalYear, w.month), [w.fiscalYear, w.month])
  const days = useMemo(() => eachDayOfInterval({ start: range.start, end: range.end }), [range])

  useEffect(() => {
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

  const handleAddMessage = () => {
    if (!newMsgStart || !newMsgEnd || !newMsgBody.trim()) return
    if (newMsgEnd < newMsgStart) {
      alert('開始日は終了日より前にしてください')
      return
    }
    setMessages((prev) => [...prev, { startDate: newMsgStart, endDate: newMsgEnd, body: newMsgBody.trim() }])
    setNewMsgStart('')
    setNewMsgEnd('')
    setNewMsgBody('')
  }

  const handleRemoveMessage = (idx: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    setSaving(true)
    const res = await fetch(`/api/request-windows/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekdayCapacity, holidayCapacity, thresholdOverrides, messages }),
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
          <h2 className="font-semibold text-gray-900">{w.fiscalYear}年{w.month}月度 - 受付ウィンドウ設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {/* 警告閾値 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">警告閾値（希望者多数表示）</h3>
            <p className="text-xs text-gray-500 mb-2">この人数に達するとスタッフ画面に「希望者多数」の注意表示が出ます。申請自体はブロックしません。</p>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 text-sm">
                平日:
                <input type="number" min={0} max={99} value={weekdayCapacity}
                  onChange={(e) => setWeekdayCapacity(Number(e.target.value))}
                  className="w-16 px-2 py-1 border rounded" />
                名で警告
              </label>
              <label className="flex items-center gap-2 text-sm">
                休日 (土日祝):
                <input type="number" min={0} max={99} value={holidayCapacity}
                  onChange={(e) => setHolidayCapacity(Number(e.target.value))}
                  className="w-16 px-2 py-1 border rounded" />
                名で警告
              </label>
            </div>
          </section>

          {/* 管理者メッセージ */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              管理者からのメッセージ
            </h3>
            <p className="text-xs text-gray-500 mb-2">指定期間中はスタッフ画面に目立つ形で表示されます（連休のお知らせ等）</p>
            <div className="space-y-2 mb-3">
              {messages.length === 0 && (
                <p className="text-xs text-gray-400">メッセージなし</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-sm">
                  <div className="flex-1">
                    <div className="text-xs text-amber-700 font-medium">{m.startDate} 〜 {m.endDate}</div>
                    <div className="text-gray-800 mt-0.5 whitespace-pre-wrap">{m.body}</div>
                  </div>
                  <button onClick={() => handleRemoveMessage(i)} className="text-red-500 hover:text-red-700 mt-0.5">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="border border-gray-200 rounded p-3 bg-gray-50/50 space-y-2">
              <div className="flex gap-2 items-center text-sm">
                <input type="date" value={newMsgStart} onChange={(e) => setNewMsgStart(e.target.value)}
                  min={format(range.start, 'yyyy-MM-dd')} max={format(range.end, 'yyyy-MM-dd')}
                  className="px-2 py-1 border rounded" />
                <span>〜</span>
                <input type="date" value={newMsgEnd} onChange={(e) => setNewMsgEnd(e.target.value)}
                  min={format(range.start, 'yyyy-MM-dd')} max={format(range.end, 'yyyy-MM-dd')}
                  className="px-2 py-1 border rounded" />
              </div>
              <textarea value={newMsgBody} onChange={(e) => setNewMsgBody(e.target.value)}
                placeholder="例: GW期間です。連休になりますので休み希望の方は早めにお願いします。"
                rows={2}
                className="w-full px-2 py-1.5 border rounded text-sm" />
              <button onClick={handleAddMessage}
                className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded hover:bg-amber-600 inline-flex items-center gap-1">
                <Plus className="w-3 h-3" />
                メッセージ追加
              </button>
            </div>
          </section>

          {/* 個別日の閾値上書き + 申請数 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">日別の閾値・申請状況</h3>
            <p className="text-xs text-gray-500 mb-2">特定日の閾値を変更できます（例: GWは多めに設定）</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">日付</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">区分</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">既定</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">個別上書き</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-500">申請数 / 適用閾値</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const ds = format(d, 'yyyy-MM-dd')
                    const isHol = isHolidayLike(d)
                    const baseThreshold = isHol ? holidayCapacity : weekdayCapacity
                    const overrideVal = thresholdOverrides[ds]
                    const effective = overrideVal ?? baseThreshold
                    const cnt = counts[ds] ?? 0
                    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
                    const overThreshold = cnt >= effective
                    return (
                      <tr key={ds} className="border-b border-gray-100">
                        <td className="px-2 py-1.5 font-mono text-gray-700">
                          {format(d, 'M/d')} ({dow}){isHol && d.getDay() !== 0 && d.getDay() !== 6 ? '祝' : ''}
                        </td>
                        <td className="px-2 py-1.5 text-gray-500">{isHol ? '休日' : '平日'}</td>
                        <td className="px-2 py-1.5 text-gray-400">{baseThreshold}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={overrideVal ?? ''}
                            placeholder="-"
                            onChange={(e) => {
                              const v = e.target.value
                              setThresholdOverrides((prev) => {
                                const next = { ...prev }
                                if (v === '') delete next[ds]
                                else next[ds] = Number(v)
                                return next
                              })
                            }}
                            className="w-14 px-1 py-0.5 border rounded text-center"
                          />
                        </td>
                        <td className={`px-2 py-1.5 ${overThreshold ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {cnt} / {effective}
                          {overThreshold && <span className="ml-1 text-[10px]">⚠ 希望者多数</span>}
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
