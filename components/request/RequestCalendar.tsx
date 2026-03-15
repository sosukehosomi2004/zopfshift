'use client'

import { useState, useMemo } from 'react'
import { format, getDaysInMonth, getDay, addMonths, subMonths, startOfMonth } from 'date-fns'
import { ja } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Check, X, Clock } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'

export interface ShiftRequest {
  id: string
  date: string
  startTime: string
  endTime: string
  status: 'PENDING' | 'TENTATIVE' | 'APPROVED' | 'REJECTED'
  memo?: string | null
}

interface RequestCalendarProps {
  requests: ShiftRequest[]
  onSubmit: (date: string, startTime: string, endTime: string, memo?: string) => Promise<void>
  onDelete: (requestId: string) => Promise<void>
  onMonthChange?: (date: Date) => void
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
})

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

const statusConfig = {
  PENDING:   { label: '承認待ち', icon: Clock, bg: 'bg-[#E6F7FA]', text: 'text-[#0AB4CC]', border: 'border-[#0AB4CC]/30' },
  TENTATIVE: { label: '仮確定',   icon: Clock, bg: 'bg-blue-50',    text: 'text-[#2563EB]', border: 'border-[#2563EB]/30' },
  APPROVED:  { label: '確定',     icon: Check, bg: 'bg-green-50',   text: 'text-[#22C55E]', border: 'border-[#22C55E]/30' },
  REJECTED:  { label: '却下',     icon: X,     bg: 'bg-red-50',     text: 'text-[#EF4444]', border: 'border-[#EF4444]/30' },
}

export function RequestCalendar({ requests, onSubmit, onDelete, onMonthChange }: RequestCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('18:00')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const daysInMonth = getDaysInMonth(currentMonth)
  const firstDow = getDay(startOfMonth(currentMonth))

  const requestMap = useMemo(() => {
    const map = new Map<string, ShiftRequest>()
    for (const r of requests) {
      map.set(format(new Date(r.date), 'yyyy-MM-dd'), r)
    }
    return map
  }, [requests])

  const handleDayClick = (dateStr: string) => {
    const existing = requestMap.get(dateStr)
    if (existing) return // 既存は編集不可（削除のみ）
    setSelectedDate(dateStr)
    setStartTime('10:00')
    setEndTime('18:00')
    setMemo('')
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!selectedDate) return
    setSubmitting(true)
    await onSubmit(selectedDate, startTime, endTime, memo || undefined)
    setSubmitting(false)
    setModalOpen(false)
  }

  const weeks: (Date | null)[][] = []
  let week: (Date | null)[] = Array(firstDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(new Date(year, month, d))
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) {
    weeks.push([...week, ...Array(7 - week.length).fill(null)])
  }

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length

  return (
    <div className="space-y-4">
      {/* ナビゲーション */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => {
            const next = subMonths(currentMonth, 1)
            setCurrentMonth(next)
            onMonthChange?.(next)
          }}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-bold text-[#1A202C] w-32 text-center">
            {format(currentMonth, 'yyyy年M月', { locale: ja })}
          </h2>
          <Button variant="outline" size="icon" onClick={() => {
            const next = addMonths(currentMonth, 1)
            setCurrentMonth(next)
            onMonthChange?.(next)
          }}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {pendingCount > 0 && (
          <div className="text-sm text-[#718096]">
            <span className="font-semibold text-[#0AB4CC]">{pendingCount}件</span> 承認待ち
          </div>
        )}
      </div>

      {/* カレンダー */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 border-b border-[#E2E8F0]">
          {DAY_LABELS.map((label, i) => (
            <div key={label} className={cn(
              'text-center py-2 text-xs font-semibold',
              i === 0 && 'text-red-500',
              i === 6 && 'text-blue-500',
              i > 0 && i < 6 && 'text-[#718096]',
            )}>
              {label}
            </div>
          ))}
        </div>

        {/* 日付グリッド */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-[#E2E8F0] last:border-b-0">
            {week.map((day, di) => {
              if (!day) return <div key={di} className="min-h-[80px] bg-[#F8F9FA]/50" />

              const dateStr = format(day, 'yyyy-MM-dd')
              const request = requestMap.get(dateStr)
              const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr
              const dow = getDay(day)
              const status = request ? statusConfig[request.status] : null

              return (
                <div
                  key={di}
                  onClick={() => !request && handleDayClick(dateStr)}
                  className={cn(
                    'min-h-[80px] p-2 border-r border-[#E2E8F0] last:border-r-0 transition-colors',
                    !request && 'cursor-pointer hover:bg-[#F8F9FA]',
                    dow === 0 && 'bg-red-50/30',
                    dow === 6 && 'bg-blue-50/30',
                    isToday && 'bg-[#E6F7FA]/30',
                  )}
                >
                  <div className={cn(
                    'text-sm font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                    isToday && 'bg-[#0AB4CC] text-white',
                    !isToday && dow === 0 && 'text-red-500',
                    !isToday && dow === 6 && 'text-blue-500',
                    !isToday && dow !== 0 && dow !== 6 && 'text-[#1A202C]',
                  )}>
                    {day.getDate()}
                  </div>

                  {request && status && (
                    <div className={cn(
                      'rounded-md px-2 py-1 text-xs border',
                      status.bg, status.text, status.border,
                    )}>
                      <div className="flex items-center gap-1 font-medium">
                        <status.icon className="w-3 h-3" />
                        {status.label}
                      </div>
                      <div className="text-[10px] mt-0.5 opacity-80">
                        {request.startTime}〜{request.endTime}
                      </div>
                      {request.status === 'PENDING' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(request.id) }}
                          className="text-[10px] underline mt-0.5 opacity-60 hover:opacity-100"
                        >
                          取消
                        </button>
                      )}
                    </div>
                  )}

                  {!request && (
                    <div className="text-[10px] text-[#718096]/50 mt-1">タップして希望を出す</div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-4 text-xs text-[#718096]">
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={cn('w-2 h-2 rounded-sm inline-block', cfg.bg)} />
            {cfg.label}
          </span>
        ))}
      </div>

      {/* 希望入力モーダル */}
      <Dialog open={modalOpen} onOpenChange={(o) => !o && setModalOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              シフト希望を提出
              <span className="text-sm font-normal text-[#718096] ml-2">{selectedDate}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>開始時間</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>終了時間</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>メモ（任意）</Label>
              <Input
                placeholder="例: 午後から可能です"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>キャンセル</Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-[#0AB4CC] hover:bg-[#0099B0] text-white"
            >
              {submitting ? '提出中...' : '希望を提出'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
