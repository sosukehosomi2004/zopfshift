'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay } from 'date-fns'
import { ja } from 'date-fns/locale'

type DayOffRequest = {
  id: string
  date: string
  type: 'DAY_OFF' | 'PAID_LEAVE'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  memo?: string
}

const TYPE_LABELS = { DAY_OFF: '公休', PAID_LEAVE: '有休' }
const STATUS_COLORS = {
  PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  APPROVED: 'bg-green-100 text-green-700 border-green-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
}
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

export default function StaffRequestPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [requests, setRequests] = useState<DayOffRequest[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [requestType, setRequestType] = useState<'DAY_OFF' | 'PAID_LEAVE'>('DAY_OFF')
  const [memo, setMemo] = useState('')

  const fetchRequests = useCallback(async () => {
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
    const res = await fetch(`/api/day-off-requests?startDate=${start}&endDate=${end}`)
    if (res.ok) setRequests(await res.json())
  }, [currentMonth])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const startDayOfWeek = getDay(startOfMonth(currentMonth))

  const getRequestForDate = (date: Date) =>
    requests.find((r) => isSameDay(new Date(r.date), date))

  const handleSubmit = async () => {
    if (!selectedDate) return
    const res = await fetch('/api/day-off-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: format(selectedDate, 'yyyy-MM-dd'),
        type: requestType,
        memo: memo || undefined,
      }),
    })
    if (res.ok) {
      setSelectedDate(null)
      setMemo('')
      fetchRequests()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この申請を取り消しますか？')) return
    await fetch(`/api/day-off-requests/${id}`, { method: 'DELETE' })
    fetchRequests()
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">休み申請</h1>
      <p className="text-sm text-gray-400 mb-6">日付をタップして公休または有休を申請してください</p>

      {/* 月ナビ */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-gray-100 rounded">
          <ChevronLeft className="w-5 h-5 text-gray-500" />
        </button>
        <span className="font-semibold text-gray-900">
          {format(currentMonth, 'yyyy年 M月', { locale: ja })}
        </span>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-gray-100 rounded">
          <ChevronRight className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* カレンダー */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAY_NAMES.map((d, i) => (
            <div key={d} className={`text-center text-xs font-medium py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {days.map((day) => {
            const req = getRequestForDate(day)
            const dayOfWeek = getDay(day)
            const isSelected = selectedDate && isSameDay(day, selectedDate)

            return (
              <button
                key={day.toISOString()}
                onClick={() => !req && setSelectedDate(day)}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                  isSelected
                    ? 'bg-[#0AB4CC] text-white'
                    : req
                    ? 'cursor-default'
                    : 'hover:bg-gray-50'
                } ${dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-700'}`}
              >
                <span className={isSelected ? 'text-white' : ''}>{format(day, 'd')}</span>
                {req && (
                  <span className={`text-[10px] px-1 rounded mt-0.5 ${
                    req.type === 'DAY_OFF' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                  }`}>
                    {TYPE_LABELS[req.type]}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 申請フォーム */}
      {selectedDate && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">
              {format(selectedDate, 'M月d日(E)', { locale: ja })}の申請
            </h3>
            <button onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-3 mb-3">
            {(['DAY_OFF', 'PAID_LEAVE'] as const).map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="type" checked={requestType === type}
                  onChange={() => setRequestType(type)} className="accent-[#0AB4CC]" />
                <span className="text-sm">{TYPE_LABELS[type]}</span>
              </label>
            ))}
          </div>
          <input
            type="text"
            placeholder="メモ（任意）"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20"
          />
          <button onClick={handleSubmit}
            className="w-full bg-[#0AB4CC] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#099bb0]">
            申請する
          </button>
        </div>
      )}

      {/* 申請一覧 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">申請一覧</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">この月の申請はありません</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-gray-500">{r.date.split('T')[0]}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    r.type === 'DAY_OFF' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                  }`}>
                    {TYPE_LABELS[r.type]}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLORS[r.status]}`}>
                    {r.status === 'PENDING' ? '承認待ち' : r.status === 'APPROVED' ? '承認済' : '却下'}
                  </span>
                </div>
                {r.status === 'PENDING' && (
                  <button onClick={() => handleDelete(r.id)} className="text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
