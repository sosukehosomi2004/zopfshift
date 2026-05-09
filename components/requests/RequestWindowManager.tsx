'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Calendar, Clock, Settings } from 'lucide-react'
import { RequestWindowEditModal } from './RequestWindowEditModal'

type Message = { startDate: string; endDate: string; body: string }

type RequestWindow = {
  id: string
  fiscalYear: number
  month: number
  deadline: string // ISO datetime
  weekdayCapacity: number
  holidayCapacity: number
  thresholdOverrides: Record<string, number>
  messages: Message[]
}

function fmtDeadline(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${m}/${day} ${hh}:${mm}`
}

function periodRangeLabel(fiscalYear: number, month: number): string {
  const startMonth = month === 1 ? 12 : month - 1
  const startYear = month === 1 ? fiscalYear - 1 : fiscalYear
  return `${startYear}/${String(startMonth).padStart(2, '0')}/21 〜 ${fiscalYear}/${String(month).padStart(2, '0')}/20`
}

function isPast(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now()
}

export function RequestWindowManager() {
  const [windows, setWindows] = useState<RequestWindow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<RequestWindow | null>(null)

  const now = new Date()
  // デフォルト: 翌月度
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(((now.getMonth() + 2 - 1) % 12) + 1)
  // デフォルト締切: 翌月度の前月末23:59 (例: 6月度 → 4/30 23:59)
  const computeDefaultDeadline = (y: number, m: number) => {
    // 月度の開始が (m-1)月21日なので、その3週間前 = (m-1)月の前1週間 (m-2)月末 とすると安全側
    // ここでは「期間開始 (m-1月21日) の20日前 = 同月1日 23:59」をデフォルトに
    // つまり 6月度なら 5/1 23:59
    const startMonth = m === 1 ? 12 : m - 1
    const startYear = m === 1 ? y - 1 : y
    const target = new Date(`${startYear}-${String(startMonth).padStart(2, '0')}-01T23:59:00`)
    return target
  }
  const [deadline, setDeadline] = useState(() => {
    const d = computeDefaultDeadline(year, month)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })

  const fetchWindows = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/request-windows')
    if (res.ok) setWindows(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchWindows()
  }, [fetchWindows])

  const handleCreate = async () => {
    const res = await fetch('/api/request-windows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fiscalYear: year,
        month,
        deadline: new Date(deadline).toISOString(),
      }),
    })
    if (res.ok) {
      setShowCreate(false)
      fetchWindows()
    } else {
      const data = await res.json().catch(() => ({}))
      alert(typeof data.error === 'string' ? data.error : '作成に失敗しました')
    }
  }

  const handleUpdateDeadline = async (id: string, currentDeadline: string) => {
    const current = new Date(currentDeadline)
    const localStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}T${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`
    const input = prompt('新しい申請締切を入力してください (YYYY-MM-DDTHH:MM)', localStr)
    if (!input) return
    const res = await fetch(`/api/request-windows/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deadline: new Date(input).toISOString() }),
    })
    if (res.ok) fetchWindows()
    else alert('更新に失敗しました')
  }

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`「${label}」の受付ウィンドウを削除します。受付済みの申請データはそのまま残ります。よろしいですか？`)) return
    const res = await fetch(`/api/request-windows/${id}`, { method: 'DELETE' })
    if (res.ok) fetchWindows()
  }

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold">申請受付ウィンドウ</h2>
          <p className="text-xs text-gray-400">スタッフが休み申請を出せる期間と締切を管理します</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 bg-[#0AB4CC] text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#099bb0]"
        >
          <Plus className="w-4 h-4" />
          新規開設
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg space-y-2">
          <div className="flex gap-2 items-center flex-wrap">
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="w-24 px-2 py-1.5 border rounded text-sm"
            />
            <span className="text-sm text-gray-600">年</span>
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value))}
              className="px-2 py-1.5 border rounded text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}月度
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">→ {periodRangeLabel(year, month)}</span>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-600">締切:</span>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="px-2 py-1.5 border rounded text-sm"
            />
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleCreate}
              className="px-3 py-1.5 bg-[#0AB4CC] text-white rounded text-sm hover:bg-[#099bb0]"
            >
              開設
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded text-sm"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-4 text-center">読み込み中...</p>
      ) : windows.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">受付ウィンドウがありません。「新規開設」から作成してください。</p>
      ) : (
        <div className="space-y-2">
          {windows.map((w) => (
            <div key={w.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-semibold text-gray-900">{w.fiscalYear}年{w.month}月度</span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {periodRangeLabel(w.fiscalYear, w.month)}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded inline-flex items-center gap-1 ${
                  isPast(w.deadline) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                }`}>
                  <Clock className="w-3 h-3" />
                  締切: {fmtDeadline(w.deadline)}
                  {isPast(w.deadline) && ' (締切後)'}
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditTarget(w)}
                  className="text-xs px-2 py-1 rounded bg-white border hover:bg-gray-100 text-gray-600 inline-flex items-center gap-1"
                >
                  <Settings className="w-3 h-3" />
                  詳細設定
                </button>
                <button
                  onClick={() => handleUpdateDeadline(w.id, w.deadline)}
                  className="text-xs px-2 py-1 rounded bg-white border hover:bg-gray-100 text-gray-600"
                >
                  締切変更
                </button>
                <button
                  onClick={() => handleDelete(w.id, `${w.fiscalYear}年${w.month}月度`)}
                  className="text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editTarget && (
        <RequestWindowEditModal
          window={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={fetchWindows}
        />
      )}
    </section>
  )
}
