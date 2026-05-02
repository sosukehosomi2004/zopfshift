'use client'

import { useState, useEffect } from 'react'
import { Plus, ChevronRight, Trash2 } from 'lucide-react'
import Link from 'next/link'

type ShiftPeriod = {
  id: string
  startDate: string
  endDate: string
  label: string
  status: string
  _count: { candidates: number }
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '下書き',
  GENERATING: '生成中',
  REVIEW: 'レビュー中',
  ADJUSTING: '手動調整',
  CONFIRMED: '確定',
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  GENERATING: 'bg-yellow-100 text-yellow-700',
  REVIEW: 'bg-blue-100 text-blue-700',
  ADJUSTING: 'bg-purple-100 text-purple-700',
  CONFIRMED: 'bg-green-100 text-green-700',
}

export default function ShiftPeriodsPage() {
  const [periods, setPeriods] = useState<ShiftPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  // フォームは「○月度」表記。例: fiscalYear=2026, fiscalMonth=6 → 6月度 = 5/21~6/20
  const initial = (() => {
    const now = new Date()
    const day = now.getDate()
    const m = now.getMonth() + 1
    const y = now.getFullYear()
    if (day >= 21) {
      return m === 12 ? { fy: y + 1, fm: 1 } : { fy: y, fm: m + 1 }
    }
    return { fy: y, fm: m }
  })()
  const [fiscalYear, setFiscalYear] = useState(initial.fy)
  const [fiscalMonth, setFiscalMonth] = useState(initial.fm)

  const fetchPeriods = async () => {
    setLoading(true)
    const res = await fetch('/api/shift-periods')
    if (res.ok) setPeriods(await res.json())
    setLoading(false)
  }

  useEffect(() => { fetchPeriods() }, [])

  const handleCreate = async () => {
    // fiscalYear/fiscalMonth → API の year/month (期間開始月) に変換
    // 6月度 (fy=2026, fm=6) → year=2026, month=5 (5/21開始)
    // 1月度 (fy=2026, fm=1) → year=2025, month=12 (12/21開始)
    const apiYear = fiscalMonth === 1 ? fiscalYear - 1 : fiscalYear
    const apiMonth = fiscalMonth === 1 ? 12 : fiscalMonth - 1
    const res = await fetch('/api/shift-periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: apiYear, month: apiMonth }),
    })
    if (res.ok) {
      setShowCreate(false)
      fetchPeriods()
    } else {
      const data = await res.json()
      alert(data.error)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">シフト管理</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#0AB4CC] text-white px-4 py-2 rounded-lg hover:bg-[#099bb0] text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          新規シフト期間
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 max-w-sm">
          <h3 className="font-semibold text-gray-900 mb-3">シフト期間を作成</h3>
          <p className="text-xs text-gray-400 mb-3">○月度 = (前月)21日 〜 ○月20日 が対象期間になります</p>
          <div className="flex gap-2 mb-2">
            <input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(parseInt(e.target.value))}
              className="w-24 px-3 py-2 border rounded-lg text-sm" />
            <span className="self-center text-sm text-gray-500">年</span>
            <select value={fiscalMonth} onChange={(e) => setFiscalMonth(parseInt(e.target.value))}
              className="px-3 py-2 border rounded-lg text-sm">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}月度</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            → {fiscalMonth === 1 ? `${fiscalYear - 1}/12/21` : `${fiscalYear}/${String(fiscalMonth - 1).padStart(2, '0')}/21`} 〜 {fiscalYear}/{String(fiscalMonth).padStart(2, '0')}/20
          </p>
          <div className="flex gap-2">
            <button onClick={handleCreate}
              className="px-4 py-2 bg-[#0AB4CC] text-white rounded-lg text-sm hover:bg-[#099bb0]">
              作成
            </button>
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : periods.length === 0 ? (
        <div className="text-center py-12 text-gray-400">シフト期間がありません</div>
      ) : (
        <div className="space-y-2">
          {periods.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4 hover:border-[#0AB4CC]/30 transition-colors"
            >
              <Link
                href={`/dashboard/shift-periods/${p.id}`}
                className="flex items-center gap-4 flex-1"
              >
                <div>
                  <div className="font-semibold text-gray-900">{p.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {p.startDate.split('T')[0]} 〜 {p.endDate.split('T')[0]}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status]}`}>
                  {STATUS_LABELS[p.status]}
                </span>
                {p._count.candidates > 0 && (
                  <span className="text-xs text-gray-400">{p._count.candidates}候補</span>
                )}
              </Link>
              <div className="flex items-center gap-2">
                <button
                  onClick={async (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const candidateNote = p._count.candidates > 0 ? `\n候補${p._count.candidates}件と事前確定セルもすべて削除されます。` : ''
                    if (!confirm(`「${p.label}」を削除します。${candidateNote}\n\nよろしいですか？`)) return
                    const res = await fetch(`/api/shift-periods/${p.id}`, { method: 'DELETE' })
                    if (res.ok) {
                      fetchPeriods()
                    } else {
                      alert('削除に失敗しました')
                    }
                  }}
                  className="text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                  title="シフト期間を削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  削除
                </button>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
