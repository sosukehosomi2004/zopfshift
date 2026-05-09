'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, X, Clock, Lock, MessageSquare, AlertTriangle } from 'lucide-react'
import { format, eachDayOfInterval, getDay, isSameDay } from 'date-fns'
import { ja } from 'date-fns/locale'

type DayOffRequest = {
  id: string
  date: string
  type: 'DAY_OFF' | 'PAID_LEAVE'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  memo?: string
}

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
  dayCounts: Record<string, number>
}

const TYPE_LABELS = { DAY_OFF: '公休', PAID_LEAVE: '有休' }
const STATUS_COLORS = {
  PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  APPROVED: 'bg-green-100 text-green-700 border-green-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
}
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

function periodRange(fiscalYear: number, month: number): { start: Date; end: Date } {
  const startMonth = month === 1 ? 12 : month - 1
  const startYear = month === 1 ? fiscalYear - 1 : fiscalYear
  return {
    start: new Date(`${startYear}-${String(startMonth).padStart(2, '0')}-21T00:00:00`),
    end: new Date(`${fiscalYear}-${String(month).padStart(2, '0')}-20T00:00:00`),
  }
}

function fmtDateOnly(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function deadlineCountdown(iso: string): { text: string; isPast: boolean } {
  const target = new Date(iso).getTime()
  const now = Date.now()
  const diff = target - now
  if (diff <= 0) return { text: '締切済', isPast: true }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
  if (days > 0) return { text: `あと${days}日${hours}時間`, isPast: false }
  if (hours > 0) return { text: `あと${hours}時間`, isPast: false }
  const minutes = Math.floor((diff / (1000 * 60)) % 60)
  return { text: `あと${minutes}分`, isPast: false }
}

export default function StaffRequestPage() {
  const [windows, setWindows] = useState<RequestWindow[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [requests, setRequests] = useState<DayOffRequest[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [requestType, setRequestType] = useState<'DAY_OFF' | 'PAID_LEAVE'>('DAY_OFF')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchWindows = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/request-windows')
    if (res.ok) {
      const list: RequestWindow[] = await res.json()
      // 並び替え: 締切が近い・未来のものを優先
      list.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
      setWindows(list)
      // デフォルト選択: 締切前で最も早い deadline のもの
      const firstUpcoming = list.findIndex((w) => new Date(w.deadline).getTime() > Date.now())
      if (firstUpcoming >= 0) setSelectedIdx(firstUpcoming)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchWindows()
  }, [fetchWindows])

  const currentWindow = windows[selectedIdx]
  const range = useMemo(() => {
    if (!currentWindow) return null
    return periodRange(currentWindow.fiscalYear, currentWindow.month)
  }, [currentWindow])

  const fetchRequests = useCallback(async () => {
    if (!range) return
    const params = new URLSearchParams({
      startDate: fmtDateOnly(range.start),
      endDate: fmtDateOnly(range.end),
    })
    const res = await fetch(`/api/day-off-requests?${params}`)
    if (res.ok) setRequests(await res.json())
  }, [range])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  if (loading) {
    return <div className="text-center py-12 text-gray-400">読み込み中...</div>
  }

  if (windows.length === 0) {
    return (
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">休み申請</h1>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center mt-6">
          <p className="text-gray-500">現在、申請受付中の期間はありません。</p>
          <p className="text-xs text-gray-400 mt-2">管理者が受付を開始するまでお待ちください。</p>
        </div>
      </div>
    )
  }

  const days = range ? eachDayOfInterval({ start: range.start, end: range.end }) : []
  const startDayOfWeek = range ? getDay(range.start) : 0
  const countdown = currentWindow ? deadlineCountdown(currentWindow.deadline) : null
  const isClosed = countdown?.isPast === true

  const getRequestForDate = (date: Date) =>
    requests.find((r) => isSameDay(new Date(r.date), date))

  // 該当日のソフト警告状態 (希望者多数) を返す。申請ブロックはしない。
  const getDayState = (date: Date): { warn: boolean; threshold: number; count: number } => {
    if (!currentWindow) return { warn: false, threshold: 0, count: 0 }
    const dateStr = format(date, 'yyyy-MM-dd')
    const dow = date.getDay()
    const isHol = dow === 0 || dow === 6
    const baseThreshold = isHol ? currentWindow.holidayCapacity : currentWindow.weekdayCapacity
    const threshold = (currentWindow.thresholdOverrides ?? {})[dateStr] ?? baseThreshold
    const count = (currentWindow.dayCounts ?? {})[dateStr] ?? 0
    return { warn: count >= threshold, threshold, count }
  }

  // 指定日にかかる管理者メッセージを返す
  const getMessagesForDate = (date: Date): Message[] => {
    if (!currentWindow?.messages) return []
    const ds = format(date, 'yyyy-MM-dd')
    return currentWindow.messages.filter((m) => ds >= m.startDate && ds <= m.endDate)
  }

  const handleSubmit = async () => {
    if (!selectedDate) return
    setError('')
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
    } else {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === 'string' ? data.error : '申請に失敗しました')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この申請を取り消しますか？')) return
    const res = await fetch(`/api/day-off-requests/${id}`, { method: 'DELETE' })
    if (res.ok) {
      fetchRequests()
    } else {
      const data = await res.json().catch(() => ({}))
      alert(typeof data.error === 'string' ? data.error : '取り消しに失敗しました')
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">休み申請</h1>
      <p className="text-sm text-gray-400 mb-4">期間を選択し、日付をタップして公休または有休を申請してください</p>

      {/* ウィンドウナビ */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setSelectedIdx((i) => Math.max(0, i - 1))}
          disabled={selectedIdx === 0}
          className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5 text-gray-500" />
        </button>
        <span className="font-semibold text-gray-900 text-lg">
          {currentWindow.fiscalYear}年{currentWindow.month}月度
        </span>
        <button
          onClick={() => setSelectedIdx((i) => Math.min(windows.length - 1, i + 1))}
          disabled={selectedIdx === windows.length - 1}
          className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* 締切表示 */}
      {countdown && range && (
        <div className={`flex items-center justify-between mb-4 p-3 rounded-lg border ${
          isClosed
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4" />
            <span>
              締切: {format(new Date(currentWindow.deadline), 'M月d日 HH:mm', { locale: ja })}
            </span>
          </div>
          <span className={`text-sm font-semibold ${isClosed ? 'text-red-600' : 'text-blue-600'}`}>
            {countdown.text}
          </span>
        </div>
      )}
      <p className="text-xs text-gray-400 mb-4">
        対象期間: {range && format(range.start, 'yyyy/MM/dd', { locale: ja })} 〜 {range && format(range.end, 'yyyy/MM/dd', { locale: ja })}
      </p>

      {/* 管理者メッセージ */}
      {currentWindow.messages && currentWindow.messages.length > 0 && (
        <div className="mb-4 space-y-2">
          {currentWindow.messages.map((m, i) => (
            <div key={i} className="bg-amber-50 border-l-4 border-amber-400 rounded-r-lg p-3">
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-xs text-amber-700 font-medium">
                    {format(new Date(m.startDate + 'T00:00:00'), 'M/d', { locale: ja })} 〜 {format(new Date(m.endDate + 'T00:00:00'), 'M/d', { locale: ja })}
                  </div>
                  <div className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{m.body}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* カレンダー */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 relative">
        {isClosed && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
              <Lock className="w-5 h-5 text-red-600 mx-auto mb-1" />
              <p className="text-sm font-semibold text-red-700">この期間は申請締切済です</p>
              <p className="text-xs text-red-600 mt-1">新規申請・取消はできません</p>
            </div>
          </div>
        )}
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
            const state = getDayState(day)
            const hasMessage = getMessagesForDate(day).length > 0
            const clickable = !req && !isClosed

            return (
              <button
                key={day.toISOString()}
                onClick={() => clickable && setSelectedDate(day)}
                disabled={!clickable}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors ${
                  isSelected
                    ? 'bg-[#0AB4CC] text-white'
                    : req
                      ? 'cursor-default'
                      : isClosed
                        ? 'cursor-not-allowed'
                        : state.warn
                          ? 'bg-amber-50 hover:bg-amber-100'
                          : 'hover:bg-gray-50'
                } ${hasMessage ? 'ring-2 ring-amber-400' : ''} ${
                  dayOfWeek === 0 && !req ? 'text-red-500' : ''
                } ${dayOfWeek === 6 && !req ? 'text-blue-500' : ''}`}
                title={hasMessage ? '管理者メッセージあり' : ''}
              >
                <span className={isSelected ? 'text-white' : ''}>
                  {format(day, 'M/d')}
                </span>
                {req ? (
                  <span className={`text-[10px] px-1 rounded mt-0.5 ${
                    req.type === 'DAY_OFF' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                  }`}>
                    {TYPE_LABELS[req.type]}
                  </span>
                ) : state.warn ? (
                  <span className="text-[9px] text-amber-700 mt-0.5">⚠ 多数</span>
                ) : state.threshold > 0 ? (
                  <span className="text-[9px] text-gray-400 mt-0.5">{state.count}/{state.threshold}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {/* 申請フォーム */}
      {selectedDate && !isClosed && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">
              {format(selectedDate, 'M月d日(E)', { locale: ja })}の申請
            </h3>
            <button onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {(() => {
            const state = getDayState(selectedDate)
            if (!state.warn) return null
            return (
              <div className="bg-amber-50 border border-amber-200 rounded p-2.5 mb-3 flex items-start gap-2 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>休み希望者多数の日です ({state.count}/{state.threshold}名以上)。承認されない可能性がありますがご注意ください。</span>
              </div>
            )
          })()}
          {getMessagesForDate(selectedDate).map((m, i) => (
            <div key={i} className="bg-amber-50 border border-amber-200 rounded p-2.5 mb-3 text-xs text-amber-800 whitespace-pre-wrap">
              {m.body}
            </div>
          ))}
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
          {error && (
            <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded mb-3">{error}</div>
          )}
          <button onClick={handleSubmit}
            className="w-full bg-[#0AB4CC] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#099bb0]">
            申請する
          </button>
        </div>
      )}

      {/* 申請一覧 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">この期間の申請</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">この期間の申請はありません</p>
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
                {r.status === 'PENDING' && !isClosed && (
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
