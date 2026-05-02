'use client'

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, Check, X, RotateCcw } from 'lucide-react'
import { RequestWindowManager } from '@/components/requests/RequestWindowManager'
import { getPeriodRange, getFiscalMonthFromDate } from '@/lib/period-month'

type DayOffRequest = {
  id: string
  date: string
  type: 'DAY_OFF' | 'PAID_LEAVE'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  memo?: string
  employee: {
    id: string
    lastName: string
    firstName: string
    primaryWorkplace: string
  }
}

const TYPE_LABELS = { DAY_OFF: '公休', PAID_LEAVE: '有休' }
const STATUS_LABELS = { PENDING: '承認待ち', APPROVED: '承認済', REJECTED: '却下' }
const STATUS_COLORS = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}
const WORKPLACE_LABELS: Record<string, string> = {
  FACTORY: '工場', CAFE: 'カフェ', FLOOR: 'フロア', OFFICE: '事務', OTHER: 'その他',
}

type FilterStatus = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'

export default function RequestsPage() {
  // 「○月度」 (シフト期間) ベースで管理
  const initial = getFiscalMonthFromDate(new Date())
  const [fiscalYear, setFiscalYear] = useState(initial.fiscalYear)
  const [month, setMonth] = useState(initial.month)
  const [requests, setRequests] = useState<DayOffRequest[]>([])
  const [filter, setFilter] = useState<FilterStatus>('ALL')
  const [loading, setLoading] = useState(true)

  const navigateMonth = (delta: number) => {
    let newMonth = month + delta
    let newYear = fiscalYear
    while (newMonth > 12) { newMonth -= 12; newYear++ }
    while (newMonth < 1) { newMonth += 12; newYear-- }
    setFiscalYear(newYear)
    setMonth(newMonth)
  }

  const range = getPeriodRange(fiscalYear, month)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    const start = format(range.start, 'yyyy-MM-dd')
    const end = format(range.end, 'yyyy-MM-dd')
    const params = new URLSearchParams({ startDate: start, endDate: end })
    const res = await fetch(`/api/day-off-requests?${params}`)
    if (res.ok) setRequests(await res.json())
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear, month])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const filtered = filter === 'ALL' ? requests : requests.filter((r) => r.status === filter)

  const handleAction = async (
    id: string,
    status: 'PENDING' | 'APPROVED' | 'REJECTED',
    currentStatus?: 'PENDING' | 'APPROVED' | 'REJECTED',
    requestDate?: string,
  ) => {
    // 承認時: 該当日のシフト期間が既に生成されているなら警告
    if (status === 'APPROVED' && requestDate) {
      const dateStr = requestDate.split('T')[0]
      const periodsRes = await fetch('/api/shift-periods')
      if (periodsRes.ok) {
        const periods: { id: string; startDate: string; endDate: string; status: string; _count: { candidates: number } }[] = await periodsRes.json()
        const matchingPeriod = periods.find(
          (p) =>
            (p.status === 'REVIEW' || p.status === 'ADJUSTING' || p.status === 'CONFIRMED') &&
            p._count.candidates > 0 &&
            dateStr >= p.startDate.split('T')[0] &&
            dateStr <= p.endDate.split('T')[0],
        )
        if (matchingPeriod) {
          const ok = confirm(
            `この申請の対象日 (${dateStr}) は、既にシフト生成済みの期間に含まれます。\n\n` +
              `承認すると：\n` +
              `・該当従業員のその日の勤務は「休み」に自動変更されます\n` +
              `・人数不足が発生するため、シフト期間ページで代わりの人を手動配置してください\n\n` +
              `承認しますか？`,
          )
          if (!ok) return
        }
      }
    }

    // 承認済みを取り消す場合の確認 (副作用注意)
    if (currentStatus === 'APPROVED' && status !== 'APPROVED') {
      const ok = confirm(
        `承認済みの申請を${status === 'REJECTED' ? '却下' : 'PENDINGに戻し'}ます。\n\n` +
          `承認時に作られた事前確定セルは取り消されます。\nよろしいですか？`,
      )
      if (!ok) return
    }

    const res = await fetch(`/api/day-off-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const data = await res.json()
      const a = data.updatedAssignments ?? 0
      const p = data.updatedPreAssignments ?? 0
      const rev = data.revertedPreAssignments ?? 0
      const parts: string[] = []
      if (a > 0) parts.push(`シフト割当 ${a}件を休みに更新`)
      if (p > 0) parts.push(`事前確定 ${p}件を休みに更新`)
      if (rev > 0) parts.push(`事前確定 ${rev}件を取り消し`)
      if (parts.length > 0) alert(parts.join('\n'))
    }
    fetchRequests()
  }

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">申請管理</h1>
          {pendingCount > 0 && (
            <p className="text-sm text-yellow-600 mt-1">{pendingCount}件の承認待ちがあります</p>
          )}
        </div>
      </div>

      {/* 申請受付ウィンドウ管理 */}
      <RequestWindowManager />

      {/* 月度ナビ (シフト期間ベース) */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigateMonth(-1)} className="p-1 hover:bg-gray-100 rounded">
          <ChevronLeft className="w-5 h-5 text-gray-500" />
        </button>
        <span className="font-semibold text-gray-900">
          {fiscalYear}年{month}月度
        </span>
        <span className="text-xs text-gray-400">
          ({format(range.start, 'yyyy/MM/dd')} 〜 {format(range.end, 'yyyy/MM/dd')})
        </span>
        <button onClick={() => navigateMonth(1)} className="p-1 hover:bg-gray-100 rounded">
          <ChevronRight className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* フィルタ */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {s === 'ALL' ? '全て' : STATUS_LABELS[s]}
            {s === 'PENDING' && pendingCount > 0 && (
              <span className="ml-1 bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* テーブル */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">日付</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">従業員</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">勤務場所</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">種別</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">ステータス</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">メモ</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-gray-600">{r.date.split('T')[0]}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {r.employee.lastName} {r.employee.firstName}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {WORKPLACE_LABELS[r.employee.primaryWorkplace]}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      r.type === 'DAY_OFF' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                    }`}>
                      {TYPE_LABELS[r.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{r.memo || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      {r.status !== 'APPROVED' && (
                        <button
                          onClick={() => handleAction(r.id, 'APPROVED', r.status, r.date)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-50 hover:bg-green-100 text-green-600"
                        >
                          <Check className="w-3 h-3" /> 承認
                        </button>
                      )}
                      {r.status !== 'REJECTED' && (
                        <button
                          onClick={() => handleAction(r.id, 'REJECTED', r.status)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600"
                        >
                          <X className="w-3 h-3" /> 却下
                        </button>
                      )}
                      {r.status !== 'PENDING' && (
                        <button
                          onClick={() => handleAction(r.id, 'PENDING', r.status)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                        >
                          <RotateCcw className="w-3 h-3" /> 未処理に戻す
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    該当する申請がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
