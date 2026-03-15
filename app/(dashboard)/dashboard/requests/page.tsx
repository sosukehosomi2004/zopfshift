'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSocket } from '@/hooks/useSocket'
import { format, addMonths, subMonths, startOfWeek, endOfWeek, addDays, addWeeks, subDays, subWeeks } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Check, X, Clock, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePickerButton } from '@/components/ui/DatePickerButton'
import { cn } from '@/lib/utils'
import { SegmentEditor, type SegmentData } from '@/components/request/SegmentEditor'
import { ShiftCalendarView, type ViewMode } from '@/components/schedule/ShiftCalendarView'
import type { ShiftData } from '@/components/schedule/ShiftBlock'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SegmentRow {
  id: string; startTime: string; endTime: string; isBreak: boolean
  position?: { id: string; name: string; color: string } | null
}

interface StaffRequest {
  id: string
  date: string
  startTime: string
  endTime: string
  status: 'PENDING' | 'TENTATIVE' | 'APPROVED' | 'REJECTED'
  memo?: string | null
  user: { id: string; name: string }
  segments?: SegmentRow[]
}

interface Position {
  id: string; name: string; color: string
}

interface StaffMember {
  id: string; name: string; color: string
}

const statusConfig = {
  PENDING:   { label: '承認待ち', icon: Clock, bg: 'bg-[#FEF9C3]', text: 'text-[#92400E]', border: 'border-[#D97706]/30' },
  TENTATIVE: { label: '仮確定',   icon: Clock, bg: 'bg-blue-50',    text: 'text-[#2563EB]', border: 'border-[#2563EB]/30' },
  APPROVED:  { label: '確定',     icon: Check, bg: 'bg-green-50',   text: 'text-[#22C55E]', border: 'border-[#22C55E]/30' },
  REJECTED:  { label: '却下',     icon: X,     bg: 'bg-red-50',     text: 'text-[#EF4444]', border: 'border-[#EF4444]/30' },
}

const STORE_ID = 'store1'

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const [requests, setRequests] = useState<StaffRequest[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'TENTATIVE' | 'APPROVED' | 'REJECTED'>('PENDING')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const socketRef = useSocket(STORE_ID)

  // シフト表用ビュー
  const [viewMode, setViewMode] = useState<ViewMode>('週')
  const [scheduleDate, setScheduleDate] = useState(new Date())

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1

    const [reqRes, posRes, staffRes] = await Promise.all([
      fetch(`/api/stores/${STORE_ID}/requests?year=${year}&month=${month}`),
      fetch(`/api/stores/${STORE_ID}/positions`),
      fetch(`/api/stores/${STORE_ID}/staff`),
    ])

    if (reqRes.ok) setRequests(await reqRes.json())
    if (posRes.ok) setPositions(await posRes.json())
    if (staffRes.ok) {
      const data = await staffRes.json()
      setStaffList(data.map((s: StaffMember) => ({ id: s.id, name: s.name, color: s.color })))
    }
    setLoading(false)
  }, [currentMonth])

  useEffect(() => { fetchAll() }, [fetchAll])

  // WebSocket
  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return
    const onNew = (r: StaffRequest) => {
      setRequests(prev => {
        const d = new Date(r.date)
        if (d.getFullYear() !== currentMonth.getFullYear() || d.getMonth() !== currentMonth.getMonth()) return prev
        if (prev.find(p => p.id === r.id)) return prev
        return [...prev, r]
      })
    }
    const onUpdated = (r: StaffRequest) => {
      setRequests(prev => prev.map(p => p.id === r.id ? r : p))
    }
    socket.on('request:new', onNew)
    socket.on('request:updated', onUpdated)
    return () => { socket.off('request:new', onNew); socket.off('request:updated', onUpdated) }
  }, [socketRef, currentMonth])

  // 仮確定（セグメント付き）
  const handleTentative = async (requestId: string, segments: SegmentData[]) => {
    setSaving(true)
    const res = await fetch(`/api/stores/${STORE_ID}/requests/${requestId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'TENTATIVE', segments }),
    })
    if (res.ok) {
      const updated = await res.json()
      setRequests(prev => prev.map(r => r.id === requestId ? updated : r))
      setEditingId(null)
    } else {
      const err = await res.json().catch(() => ({}))
      console.error('handleTentative error:', err)
      alert(`エラー: ${JSON.stringify(err.error ?? err)}`)
    }
    setSaving(false)
  }

  // 確定（TENTATIVE → APPROVED）
  const handleConfirm = async (requestId: string, segments?: SegmentData[]) => {
    setSaving(true)
    const request = requests.find(r => r.id === requestId)
    const segs = segments ?? request?.segments?.map(s => ({
      startTime: s.startTime, endTime: s.endTime,
      positionId: s.position?.id ?? null, isBreak: s.isBreak,
    }))
    const res = await fetch(`/api/stores/${STORE_ID}/requests/${requestId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'APPROVED', segments: segs }),
    })
    if (res.ok) {
      const updated = await res.json()
      setRequests(prev => prev.map(r => r.id === requestId ? updated : r))
      setEditingId(null)
    }
    setSaving(false)
  }

  // 一括確定（TENTATIVE → APPROVED）
  const handleBulkConfirm = async () => {
    if (selectedIds.size === 0) return
    setSaving(true)
    const ids = Array.from(selectedIds)
    await Promise.all(ids.map(async (id) => {
      const request = requests.find(r => r.id === id)
      if (!request || request.status !== 'TENTATIVE') return
      const segs = request.segments?.map(s => ({
        startTime: s.startTime, endTime: s.endTime,
        positionId: s.position?.id ?? null, isBreak: s.isBreak,
      }))
      const res = await fetch(`/api/stores/${STORE_ID}/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED', segments: segs }),
      })
      if (res.ok) {
        const updated = await res.json()
        setRequests(prev => prev.map(r => r.id === id ? updated : r))
      }
    }))
    setSelectedIds(new Set())
    setSaving(false)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const tentativeRequests = requests.filter(r => r.status === 'TENTATIVE')
  const allTentativeSelected = tentativeRequests.length > 0 && tentativeRequests.every(r => selectedIds.has(r.id))
  const toggleSelectAll = () => {
    if (allTentativeSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(tentativeRequests.map(r => r.id)))
    }
  }

  // 却下
  const handleReject = async (requestId: string) => {
    const res = await fetch(`/api/stores/${STORE_ID}/requests/${requestId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'REJECTED' }),
    })
    if (res.ok) {
      const updated = await res.json()
      setRequests(prev => prev.map(r => r.id === requestId ? updated : r))
    }
  }

  // フィルタリング
  const filtered = filter === 'ALL' ? requests : requests.filter(r => r.status === filter)
  const pendingCount = requests.filter(r => r.status === 'PENDING').length

  // 日付グループ化（ローカル時刻でグルーピング）
  const grouped = filtered.reduce<Record<string, StaffRequest[]>>((acc, r) => {
    const key = format(new Date(r.date), 'yyyy-MM-dd')
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})
  const sortedDates = Object.keys(grouped).sort()

  // 右側シフト表用データ（requestsからShiftDataに変換）
  const scheduleShifts = useMemo<ShiftData[]>(() => {
    const result: ShiftData[] = []
    for (const r of requests) {
      if ((r.status === 'APPROVED' || r.status === 'TENTATIVE') && r.segments && r.segments.length > 0) {
        for (const seg of r.segments) {
          if (seg.isBreak) continue
          result.push({
            id: seg.id, userId: r.user.id, date: r.date,
            startTime: seg.startTime, endTime: seg.endTime, breakTime: 0,
            status: 'CONFIRMED', user: r.user,
            position: seg.position ?? undefined,
            requestStatus: r.status === 'APPROVED' ? undefined : r.status,
          })
        }
      } else {
        result.push({
          id: r.id, userId: r.user.id, date: r.date,
          startTime: r.startTime, endTime: r.endTime, breakTime: 0,
          status: 'CONFIRMED', user: r.user,
          requestStatus: r.status === 'APPROVED' ? undefined : r.status,
        })
      }
    }
    return result
  }, [requests])

  // シフト表ナビゲーション
  const navigateSchedule = (dir: 1 | -1) => {
    if (viewMode === '日') setScheduleDate(d => dir === 1 ? addDays(d, 1) : subDays(d, 1))
    else if (viewMode === '週') setScheduleDate(d => dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1))
    else setScheduleDate(d => dir === 1 ? addMonths(d, 1) : subMonths(d, 1))
  }
  const scheduleLabel = (() => {
    if (viewMode === '日') return format(scheduleDate, 'M月d日（E）', { locale: ja })
    if (viewMode === '週') {
      const s = startOfWeek(scheduleDate, { weekStartsOn: 1 })
      const e = endOfWeek(scheduleDate, { weekStartsOn: 1 })
      return `${format(s, 'M/d', { locale: ja })}〜${format(e, 'M/d', { locale: ja })}`
    }
    return format(scheduleDate, 'yyyy年M月', { locale: ja })
  })()


  return (
    <div className="flex gap-4 h-[calc(100vh-80px)]">
      {/* ─── 左: シフト希望一覧 ─── */}
      <div className="w-[480px] shrink-0 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-[#1A202C]">シフト希望</h1>
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 bg-[#FEF9C3] text-[#92400E] text-xs font-medium px-2 py-1 rounded-md">
              <Clock className="w-3 h-3" />
              {pendingCount}件
            </span>
          )}
        </div>

        {/* 月ナビ */}
        <div className="flex items-center gap-2 mb-3">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="w-3 h-3" />
          </Button>
          <span className="text-sm font-semibold text-[#1A202C] w-24 text-center">
            {format(currentMonth, 'yyyy年M月', { locale: ja })}
          </span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>

        {/* フィルター */}
        <div className="flex gap-1.5 mb-3">
          {(['ALL', 'PENDING', 'TENTATIVE', 'APPROVED', 'REJECTED'] as const).map(s => {
            const labels = { ALL: 'すべて', PENDING: '承認待ち', TENTATIVE: '仮確定', APPROVED: '確定', REJECTED: '却下' }
            const counts = {
              ALL: requests.length,
              PENDING: pendingCount,
              TENTATIVE: requests.filter(r => r.status === 'TENTATIVE').length,
              APPROVED: requests.filter(r => r.status === 'APPROVED').length,
              REJECTED: requests.filter(r => r.status === 'REJECTED').length,
            }
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  filter === s
                    ? 'bg-[#1A202C] text-white'
                    : 'bg-white border border-[#E2E8F0] text-[#718096] hover:bg-[#F8F9FA]',
                )}
              >
                {labels[s]}
                <span className={cn('ml-1', filter === s ? 'opacity-70' : 'text-[#1A202C]')}>
                  {counts[s]}
                </span>
              </button>
            )
          })}
        </div>

        {/* 一括確定バー */}
        {tentativeRequests.length > 0 && (
          <div className="flex items-center justify-between bg-blue-50 border border-[#2563EB]/20 rounded-lg px-3 py-2 mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allTentativeSelected}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5 rounded border-[#CBD5E0] text-[#2563EB] focus:ring-[#2563EB]"
              />
              <span className="text-xs text-[#2563EB] font-medium">
                仮確定をすべて選択（{tentativeRequests.length}件）
              </span>
            </label>
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                onClick={handleBulkConfirm}
                disabled={saving}
                className="h-7 px-3 bg-[#22C55E] hover:bg-green-600 text-white text-xs"
              >
                <Check className="w-3 h-3 mr-1" />
                {selectedIds.size}件を確定
              </Button>
            )}
          </div>
        )}

        {/* リスト */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <div className="text-center py-12 text-[#718096] text-sm">読み込み中...</div>
          ) : sortedDates.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E2E8F0] py-12 text-center">
              <Users className="w-6 h-6 text-[#E2E8F0] mx-auto mb-2" />
              <p className="text-sm text-[#718096]">希望はありません</p>
            </div>
          ) : (
            sortedDates.map(dateStr => {
              const dayRequests = grouped[dateStr]
              const date = new Date(dateStr + 'T00:00:00+09:00')
              const dow = date.getDay()
              return (
                <div key={dateStr} className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
                  <div className="px-3 py-2 bg-[#F8F9FA] border-b border-[#E2E8F0] flex items-center gap-2">
                    <span className={cn(
                      'text-xs font-semibold',
                      dow === 0 && 'text-red-500',
                      dow === 6 && 'text-blue-500',
                      dow !== 0 && dow !== 6 && 'text-[#1A202C]',
                    )}>
                      {format(date, 'M月d日（E）', { locale: ja })}
                    </span>
                    <span className="text-[10px] text-[#718096]">{dayRequests.length}件</span>
                  </div>
                  <div className="divide-y divide-[#E2E8F0]">
                    {dayRequests.map(r => {
                      const cfg = statusConfig[r.status]
                      const Icon = cfg.icon
                      const isEditing = editingId === r.id
                      return (
                        <div key={r.id} className={cn('px-3 py-2.5', isEditing && 'bg-[#FFFBEB]', selectedIds.has(r.id) && 'bg-blue-50/50')}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {r.status === 'TENTATIVE' && !isEditing && (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(r.id)}
                                  onChange={() => toggleSelect(r.id)}
                                  className="w-3.5 h-3.5 rounded border-[#CBD5E0] text-[#2563EB] focus:ring-[#2563EB] shrink-0"
                                />
                              )}
                              <div className="w-7 h-7 rounded-full bg-[#0AB4CC] flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
                                {r.user.name.slice(0, 2)}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-[#1A202C]">{r.user.name}</div>
                                <div className="text-[10px] text-[#718096]">{r.startTime}〜{r.endTime}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={cn('flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border', cfg.bg, cfg.text, cfg.border)}>
                                <Icon className="w-2.5 h-2.5" />
                                {cfg.label}
                              </span>
                              {r.status === 'PENDING' && !isEditing && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => setEditingId(r.id)}
                                    className="h-6 px-2 bg-[#2563EB] hover:bg-blue-700 text-white text-[10px]"
                                  >
                                    仮確定
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleReject(r.id)}
                                    className="h-6 px-2 text-[#EF4444] border-[#EF4444]/30 hover:bg-red-50 text-[10px]"
                                  >
                                    却下
                                  </Button>
                                </>
                              )}
                              {r.status === 'TENTATIVE' && !isEditing && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => handleConfirm(r.id)}
                                    className="h-6 px-2 bg-[#22C55E] hover:bg-green-600 text-white text-[10px]"
                                  >
                                    確定
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingId(r.id)}
                                    className="h-6 px-2 text-[#2563EB] border-[#2563EB]/30 hover:bg-blue-50 text-[10px]"
                                  >
                                    編集
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleReject(r.id)}
                                    className="h-6 px-2 text-[#EF4444] border-[#EF4444]/30 hover:bg-red-50 text-[10px]"
                                  >
                                    却下
                                  </Button>
                                </>
                              )}
                              {r.status === 'APPROVED' && !isEditing && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingId(r.id)}
                                  className="h-6 px-2 text-[#718096] border-[#E2E8F0] hover:bg-[#F8F9FA] text-[10px]"
                                >
                                  編集
                                </Button>
                              )}
                              {r.status === 'REJECTED' && !isEditing && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingId(r.id)}
                                  className="h-6 px-2 text-[#718096] border-[#E2E8F0] hover:bg-[#F8F9FA] text-[10px]"
                                >
                                  編集
                                </Button>
                              )}
                            </div>
                          </div>
                          {r.memo && (
                            <div className="text-[10px] text-[#718096] mt-1 truncate">{r.memo}</div>
                          )}

                          {/* セグメント表示（仮確定・確定） */}
                          {(r.status === 'TENTATIVE' || r.status === 'APPROVED') && r.segments && r.segments.length > 0 && !isEditing && (
                            <div className="flex gap-0.5 mt-2">
                              {r.segments.map((seg, i) => (
                                <div
                                  key={i}
                                  className="flex-1 rounded text-center py-0.5"
                                  style={{
                                    backgroundColor: seg.isBreak ? '#E2E8F0' : (seg.position?.color ?? '#0AB4CC'),
                                    flex: `${toMin(seg.endTime) - toMin(seg.startTime)} 0 0`,
                                  }}
                                >
                                  <span className={cn(
                                    'text-[9px] font-semibold',
                                    seg.isBreak ? 'text-[#64748B]' : 'text-white',
                                  )}>
                                    {seg.isBreak ? '休憩' : seg.position?.name}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* セグメントエディター */}
                          {isEditing && (
                            <div className="mt-3">
                              <SegmentEditor
                                requestStartTime={r.startTime}
                                requestEndTime={r.endTime}
                                positions={positions}
                                initialSegments={r.segments?.map(s => ({
                                  startTime: s.startTime, endTime: s.endTime,
                                  positionId: s.position?.id ?? null, isBreak: s.isBreak,
                                }))}
                                onSave={(segs) => r.status === 'APPROVED' ? handleConfirm(r.id, segs) : handleTentative(r.id, segs)}
                                onCancel={() => setEditingId(null)}
                                saving={saving}
                                saveLabel={r.status === 'APPROVED' ? '確定' : '仮確定'}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { handleReject(r.id); setEditingId(null) }}
                                className="mt-2 h-7 px-3 text-[#EF4444] border-[#EF4444]/30 hover:bg-red-50 text-[11px]"
                              >
                                却下する
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ─── 右: シフト表 ─── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          {/* ビュー切替 */}
          <div className="flex rounded-md border border-[#E2E8F0] overflow-hidden bg-white">
            {(['日', '週', '月'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  'px-3 py-1 text-xs font-medium transition-colors border-r border-[#E2E8F0] last:border-r-0',
                  viewMode === mode ? 'bg-[#0AB4CC] text-white' : 'text-[#718096] hover:bg-[#F8F9FA]',
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* 日付ナビ */}
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => navigateSchedule(-1)}>
              <ChevronLeft className="w-3 h-3" />
            </Button>
            <span className="text-xs font-semibold text-[#1A202C] min-w-[120px] text-center">
              {scheduleLabel}
            </span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => navigateSchedule(1)}>
              <ChevronRight className="w-3 h-3" />
            </Button>
            <DatePickerButton value={scheduleDate} onChange={setScheduleDate} size="sm" />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <ShiftCalendarView
            viewMode={viewMode}
            currentDate={scheduleDate}
            staffList={staffList}
            shifts={scheduleShifts}
            onMonthChange={setScheduleDate}
          />
        </div>
      </div>
    </div>
  )
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
