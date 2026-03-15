'use client'

import { useState, useMemo } from 'react'
import { format, startOfWeek, addDays, getDay, isToday } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { ShiftGrid } from './ShiftGrid'
import type { ShiftData } from './ShiftBlock'

export type ViewMode = '日' | '週' | '月'

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

// HEXカラーを淡くする（白に寄せる）
function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lr = Math.round(r + (255 - r) * amount)
  const lg = Math.round(g + (255 - g) * amount)
  const lb = Math.round(b + (255 - b) * amount)
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`
}

function shiftBarColor(shift: ShiftData): string {
  if (shift.requestStatus === 'PENDING') return '#FDE68A'
  if (shift.requestStatus === 'TENTATIVE') {
    const base = shift.position?.color ?? '#0AB4CC'
    return lightenColor(base, 0.55)
  }
  if (shift.requestStatus === 'REJECTED') return '#CBD5E1'
  return shift.position?.color ?? '#0AB4CC'
}

function shiftOpacity(shift: ShiftData): number {
  if (shift.requestStatus === 'REJECTED') return 0.5
  return 1
}

function shiftSubLabel(shift: ShiftData): string | null {
  if (shift.requestStatus === 'PENDING') return '承認待ち'
  if (shift.requestStatus === 'TENTATIVE') return shift.position?.name ?? '仮確定'
  if (shift.requestStatus === 'REJECTED') return '却下'
  return shift.position?.name ?? null
}

interface StaffMember {
  id: string
  name: string
  nameKana?: string
  color: string
}

export type SortMode = 'かな順' | '出勤時間順' | 'ポジション順'

function useSortedStaff(staffList: StaffMember[], shifts: ShiftData[], sortMode: SortMode, currentDate: Date, viewMode: ViewMode): StaffMember[] {
  return useMemo(() => {
    // 表示中の期間に絞り込む
    const viewShifts = shifts.filter(s => {
      const d = format(new Date(s.date ?? ''), 'yyyy-MM-dd')
      if (viewMode === '日') {
        return d === format(currentDate, 'yyyy-MM-dd')
      }
      if (viewMode === '週') {
        const ws = startOfWeek(currentDate, { weekStartsOn: 1 })
        const we = addDays(ws, 6)
        return d >= format(ws, 'yyyy-MM-dd') && d <= format(we, 'yyyy-MM-dd')
      }
      // 月: 同じ年月
      return d.slice(0, 7) === format(currentDate, 'yyyy-MM')
    })

    // 却下のみのスタッフを判定（シフトが全て REJECTED のスタッフ）
    const userShifts = new Map<string, ShiftData[]>()
    for (const s of viewShifts) {
      userShifts.set(s.userId, [...(userShifts.get(s.userId) ?? []), s])
    }
    const isRejectedOnly = (id: string): boolean => {
      const us = userShifts.get(id)
      if (!us || us.length === 0) return false
      return us.every(s => s.requestStatus === 'REJECTED')
    }

    // 却下のみのスタッフを最後に送る共通ラッパー
    const withRejectedLast = (compareFn: (a: StaffMember, b: StaffMember) => number) => {
      return [...staffList].sort((a, b) => {
        const aRej = isRejectedOnly(a.id) ? 1 : 0
        const bRej = isRejectedOnly(b.id) ? 1 : 0
        if (aRej !== bRej) return aRej - bRej
        return compareFn(a, b)
      })
    }

    if (sortMode === 'かな順') {
      return withRejectedLast((a, b) => (a.nameKana ?? a.name).localeCompare(b.nameKana ?? b.name, 'ja'))
    }

    if (sortMode === '出勤時間順') {
      const earliestStart = new Map<string, string>()
      for (const s of viewShifts) {
        if (s.requestStatus === 'REJECTED') continue
        const prev = earliestStart.get(s.userId)
        if (!prev || s.startTime < prev) earliestStart.set(s.userId, s.startTime)
      }
      return withRejectedLast((a, b) => {
        const sa = earliestStart.get(a.id) ?? '99:99'
        const sb = earliestStart.get(b.id) ?? '99:99'
        return sa.localeCompare(sb)
      })
    }

    if (sortMode === 'ポジション順') {
      const mainPosition = new Map<string, string>()
      for (const s of viewShifts) {
        if (s.requestStatus === 'REJECTED') continue
        if (s.position?.name && !mainPosition.has(s.userId)) {
          mainPosition.set(s.userId, s.position.name)
        }
      }
      return withRejectedLast((a, b) => {
        const pa = mainPosition.get(a.id) ?? 'zzz'
        const pb = mainPosition.get(b.id) ?? 'zzz'
        return pa.localeCompare(pb, 'ja')
      })
    }

    return staffList
  }, [staffList, shifts, sortMode, currentDate, viewMode])
}

interface Props {
  viewMode: ViewMode
  currentDate: Date
  staffList: StaffMember[]
  shifts: ShiftData[]
  onMonthChange?: (date: Date) => void
}

const SORT_MODES: SortMode[] = ['かな順', '出勤時間順', 'ポジション順']

export function ShiftCalendarView({
  viewMode,
  currentDate,
  staffList,
  shifts,
  onMonthChange,
}: Props) {
  const [sortMode, setSortMode] = useState<SortMode>('出勤時間順')
  const sortedStaff = useSortedStaff(staffList, shifts, sortMode, currentDate, viewMode)

  const sortSelector = (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-[#718096]">並び順</span>
      {SORT_MODES.map(mode => (
        <button
          key={mode}
          onClick={() => setSortMode(mode)}
          className={cn(
            'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
            sortMode === mode
              ? 'bg-[#0AB4CC] text-white border-[#0AB4CC]'
              : 'bg-white text-[#718096] border-[#E2E8F0] hover:border-[#0AB4CC] hover:text-[#0AB4CC]',
          )}
        >
          {mode}
        </button>
      ))}
    </div>
  )

  if (viewMode === '月') {
    return (
      <div>
        <div className="flex justify-between items-center mb-2">
          <div>{sortSelector}</div>
          <Button
            onClick={() => {/* TODO */}}
            className="bg-[#0AB4CC] hover:bg-blue-600 text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            シフト追加
          </Button>
        </div>
        <ShiftGrid
          staffList={sortedStaff}
          shifts={shifts}
          initialMonth={currentDate}
          onMonthChange={onMonthChange}
        />
      </div>
    )
  }

  if (viewMode === '週') {
    return (
      <div>
        <div className="flex justify-between items-center mb-2">
          <div>{sortSelector}</div>
          <Button
            onClick={() => {/* TODO */}}
            className="bg-[#0AB4CC] hover:bg-blue-600 text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            シフト追加
          </Button>
        </div>
        <WeekView
          currentDate={currentDate}
          staffList={sortedStaff}
          shifts={shifts}
        />
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div>{sortSelector}</div>
        <Button
          onClick={() => {/* TODO */}}
          className="bg-[#0AB4CC] hover:bg-blue-600 text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          シフト追加
        </Button>
      </div>
      <DayView
        currentDate={currentDate}
        staffList={sortedStaff}
        shifts={shifts}
      />
    </div>
  )
}

// ─── 週ビュー ────────────────────────────────────────────────────────────────
function WeekView({
  currentDate,
  staffList,
  shifts,
}: {
  currentDate: Date
  staffList: StaffMember[]
  shifts: ShiftData[]
}) {

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const shiftMap = useMemo(() => {
    const map = new Map<string, ShiftData[]>()
    for (const shift of shifts) {
      const d = format(new Date(shift.date ?? ''), 'yyyy-MM-dd')
      const key = `${shift.userId}__${d}`
      map.set(key, [...(map.get(key) ?? []), shift])
    }
    return map
  }, [shifts])

  const dayStrs = useMemo(() => new Set(days.map(d => format(d, 'yyyy-MM-dd'))), [days])

  const staffTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const shift of shifts) {
      if (!dayStrs.has(format(new Date(shift.date ?? ''), 'yyyy-MM-dd'))) continue
      const [sh, sm] = shift.startTime.split(':').map(Number)
      const [eh, em] = shift.endTime.split(':').map(Number)
      const worked = (eh * 60 + em) - (sh * 60 + sm) - shift.breakTime
      totals.set(shift.userId, (totals.get(shift.userId) ?? 0) + worked)
    }
    return totals
  }, [shifts, dayStrs])




  return (
    <div>
      <div className="overflow-auto rounded-xl border border-[#E2E8F0] bg-white" style={{ maxHeight: '80vh' }}>
        <table className="border-collapse text-sm" style={{ minWidth: '760px', width: '100%' }}>
          <thead className="sticky top-0 z-30">
            <tr className="bg-[#F8F9FA]">
              <th className="sticky left-0 z-40 bg-[#F8F9FA] border-b border-r border-[#E2E8F0] px-4 py-3 text-left text-xs font-semibold text-[#718096] min-w-[140px]">
                スタッフ
              </th>
              {days.map((day) => {
                const dow = getDay(day)
                return (
                  <th
                    key={day.toISOString()}
                    className={cn(
                      'border-b border-r border-[#E2E8F0] px-2 py-2 text-center',
                      isToday(day) && 'bg-[#E6F7FA]',
                      dow === 6 && !isToday(day) && 'bg-blue-50',
                      dow === 0 && !isToday(day) && 'bg-red-50',
                    )}
                  >
                    <div className={cn(
                      'text-xs font-bold',
                      isToday(day) && 'text-[#0AB4CC]',
                      dow === 6 && !isToday(day) && 'text-blue-500',
                      dow === 0 && !isToday(day) && 'text-red-500',
                      dow !== 0 && dow !== 6 && !isToday(day) && 'text-[#1A202C]',
                    )}>
                      {format(day, 'M/d')}
                    </div>
                    <div className={cn(
                      'text-[10px]',
                      isToday(day) && 'text-[#0AB4CC]',
                      dow === 6 && !isToday(day) && 'text-blue-400',
                      dow === 0 && !isToday(day) && 'text-red-400',
                      dow !== 0 && dow !== 6 && 'text-[#718096]',
                    )}>
                      {DAY_LABELS[dow]}
                    </div>
                  </th>
                )
              })}
              <th className="border-b border-[#E2E8F0] px-3 py-2 text-center text-xs font-semibold text-[#718096] w-16">
                週計
              </th>
            </tr>
          </thead>
          <tbody>
            {staffList.map((staff) => (
              <tr key={staff.id} className="hover:bg-[#F8F9FA]/30">
                <td className="sticky left-0 z-10 bg-white border-b border-r border-[#E2E8F0] px-3 py-2">
                  <div className="font-medium text-[#1A202C] text-xs">{staff.name}</div>
                  <div className="text-[10px] text-[#718096]">
                    {((staffTotals.get(staff.id) ?? 0) / 60).toFixed(1)}h
                  </div>
                </td>
                {days.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd')
                  const cellShifts = shiftMap.get(`${staff.id}__${dateStr}`) ?? []
                  const dow = getDay(day)
                  return (
                    <td
                      key={dateStr}
                      className={cn(
                        'border-b border-r border-[#E2E8F0] px-1 py-1',
                        isToday(day) && 'bg-[#E6F7FA]/20',
                        dow === 6 && !isToday(day) && 'bg-blue-50/20',
                        dow === 0 && !isToday(day) && 'bg-red-50/20',
                      )}
                    >
                      <div className="min-h-[52px] flex flex-col gap-0.5">
                        {cellShifts.map((shift) => {
                          const isTentative = shift.requestStatus === 'TENTATIVE'
                          const isPending = shift.requestStatus === 'PENDING'
                          const textColor = isPending ? '#92400E' : isTentative ? (shift.position?.color ?? '#0AB4CC') : undefined
                          return (
                          <div
                            key={shift.id}
                            className={cn('rounded px-1.5 py-1 text-xs transition-all', !textColor && 'text-white')}
                            style={{
                              backgroundColor: shiftBarColor(shift),
                              opacity: shiftOpacity(shift),
                              color: textColor,
                              border: isPending ? '1px dashed #D97706' : isTentative ? '1px dashed #2563EB' : undefined,
                            }}
                          >
                            <div className="font-medium whitespace-nowrap">{shift.startTime}〜{shift.endTime}</div>
                            {shiftSubLabel(shift) && (
                              <div className="text-[10px] opacity-90 mt-0.5">{shiftSubLabel(shift)}</div>
                            )}
                          </div>
                          )
                        })}
                      </div>
                    </td>
                  )
                })}
                <td className="border-b border-[#E2E8F0] px-3 py-2 text-center text-xs font-semibold text-[#1A202C]">
                  {((staffTotals.get(staff.id) ?? 0) / 60).toFixed(1)}h
                </td>
              </tr>
            ))}
            {/* 人数行 */}
            <tr className="bg-[#F8F9FA]">
              <td className="sticky left-0 z-10 bg-[#F8F9FA] border-t border-r border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#718096]">
                人数
              </td>
              {days.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const count = staffList.filter(s => (shiftMap.get(`${s.id}__${dateStr}`) ?? []).length > 0).length
                return (
                  <td key={dateStr} className="border-t border-r border-[#E2E8F0] px-1 py-2 text-center text-xs font-semibold text-[#1A202C]">
                    {count > 0 ? count : <span className="text-[#CBD5E0]">-</span>}
                  </td>
                )
              })}
              <td className="border-t border-[#E2E8F0]" />
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  )
}

// ─── 日ビュー（タイムライン） ─────────────────────────────────────────────────
function DayView({
  currentDate,
  staffList,
  shifts,
}: {
  currentDate: Date
  staffList: StaffMember[]
  shifts: ShiftData[]
}) {
  const dateStr = format(currentDate, 'yyyy-MM-dd')
  const todayShifts = useMemo(
    () => shifts.filter(s => format(new Date(s.date ?? ''), 'yyyy-MM-dd') === dateStr),
    [shifts, dateStr],
  )

  // スタッフごとにシフトをグループ化
  const shiftsByUser = useMemo(() => {
    const map = new Map<string, ShiftData[]>()
    for (const s of todayShifts) {
      map.set(s.userId, [...(map.get(s.userId) ?? []), s])
    }
    return map
  }, [todayShifts])

  // タイムラインの範囲を決定（最小8時〜最大23時、データに合わせて拡張）
  const { startHour, endHour } = useMemo(() => {
    let minH = 8, maxH = 23
    for (const s of todayShifts) {
      const sh = parseInt(s.startTime.split(':')[0])
      const eh = parseInt(s.endTime.split(':')[0])
      const em = parseInt(s.endTime.split(':')[1])
      minH = Math.min(minH, sh)
      maxH = Math.max(maxH, eh + (em > 0 ? 1 : 0))
    }
    return { startHour: minH, endHour: maxH }
  }, [todayShifts])

  const totalHours = endHour - startHour
  const hours = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i)

  const working = staffList.filter(s => shiftsByUser.has(s.id))
  const notWorking = staffList.filter(s => !shiftsByUser.has(s.id))

  // 時刻文字列 → タイムライン上の %位置
  const timeToPercent = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    return ((h * 60 + m) - startHour * 60) / (totalHours * 60) * 100
  }

  // スタッフの合計勤務時間
  const calcWorkMin = (userShifts: ShiftData[]) => {
    let total = 0
    for (const s of userShifts) {
      const [sh, sm] = s.startTime.split(':').map(Number)
      const [eh, em] = s.endTime.split(':').map(Number)
      total += (eh * 60 + em) - (sh * 60 + sm)
    }
    return total
  }

  const ROW_HEIGHT = 44
  const LABEL_WIDTH = 130

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="px-4 py-3 bg-[#F8F9FA] border-b border-[#E2E8F0]">
          <h3 className="text-sm font-semibold text-[#1A202C]">出勤 {working.length}名</h3>
        </div>

        {working.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-[#718096]">この日はシフトがありません</div>
        ) : (
          <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
            <div style={{ minWidth: `${LABEL_WIDTH + totalHours * 80}px` }}>
              {/* 時間ヘッダー */}
              <div className="flex border-b border-[#E2E8F0] sticky top-0 z-20 bg-[#F8F9FA]" style={{ height: 32 }}>
                <div
                  className="shrink-0 bg-[#F8F9FA] border-r border-[#E2E8F0] flex items-center px-3 sticky left-0 z-30"
                  style={{ width: LABEL_WIDTH }}
                >
                  <span className="text-xs font-semibold text-[#718096]">スタッフ</span>
                </div>
                <div className="relative flex-1">
                  {hours.map((h) => {
                    const pct = ((h - startHour) / totalHours) * 100
                    return (
                      <div
                        key={h}
                        className="absolute top-0 h-full flex items-center"
                        style={{ left: `${pct}%` }}
                      >
                        <span className="text-[10px] text-[#718096] -translate-x-1/2">
                          {h}:00
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="shrink-0 border-l border-[#E2E8F0] flex items-center justify-center bg-[#F8F9FA]" style={{ width: 56 }}>
                  <span className="text-xs font-semibold text-[#718096]">計</span>
                </div>
              </div>

              {/* スタッフ行 */}
              {working.map((staff) => {
                const userShifts = shiftsByUser.get(staff.id) ?? []
                const workMin = calcWorkMin(userShifts)
                return (
                  <div
                    key={staff.id}
                    className="flex border-b border-[#E2E8F0] hover:bg-[#F8F9FA]/30"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {/* スタッフ名 */}
                    <div
                      className="shrink-0 border-r border-[#E2E8F0] flex items-center gap-2 px-3 bg-white sticky left-0 z-10"
                      style={{ width: LABEL_WIDTH }}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: staff.color }} />
                      <span className="text-xs font-medium text-[#1A202C] truncate">{staff.name}</span>
                    </div>

                    {/* タイムラインエリア */}
                    <div className="relative flex-1">
                      {/* 1時間ごとの縦グリッド線 */}
                      {hours.map((h) => {
                        const pct = ((h - startHour) / totalHours) * 100
                        return (
                          <div
                            key={h}
                            className="absolute top-0 h-full border-l border-[#E2E8F0]/60"
                            style={{ left: `${pct}%` }}
                          />
                        )
                      })}

                      {/* シフトバー */}
                      {userShifts.map((shift) => {
                        const left = timeToPercent(shift.startTime)
                        const right = timeToPercent(shift.endTime)
                        const width = right - left
                        const color = shiftBarColor(shift)
                        const label = shiftSubLabel(shift)
                        const isPending = shift.requestStatus === 'PENDING'
                        const isTentative = shift.requestStatus === 'TENTATIVE'
                        return (
                          <div
                            key={shift.id}
                            className="absolute top-[6px] rounded-md flex items-center overflow-hidden cursor-default"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              height: ROW_HEIGHT - 12,
                              backgroundColor: color,
                              opacity: shiftOpacity(shift),
                              border: isPending ? '1.5px dashed #D97706' : isTentative ? '1.5px dashed #2563EB' : undefined,
                            }}
                            title={`${shift.startTime}〜${shift.endTime}${label ? ` (${label})` : ''}`}
                          >
                            <span
                              className={cn(
                                'text-[10px] font-semibold px-1.5 truncate',
                                isPending ? 'text-[#92400E]' : 'text-white',
                              )}
                              style={isTentative ? { color: shift.position?.color ?? '#0AB4CC' } : undefined}
                            >
                              {label ?? `${shift.startTime}-${shift.endTime}`}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {/* 合計 */}
                    <div
                      className="shrink-0 border-l border-[#E2E8F0] flex items-center justify-center"
                      style={{ width: 56 }}
                    >
                      <span className="text-xs font-semibold text-[#1A202C]">
                        {(workMin / 60).toFixed(1)}h
                      </span>
                    </div>
                  </div>
                )
              })}

              {/* 時間帯ごとの人数サマリー */}
              <div className="flex bg-[#F8F9FA]" style={{ height: 32 }}>
                <div
                  className="shrink-0 border-r border-[#E2E8F0] flex items-center px-3"
                  style={{ width: LABEL_WIDTH }}
                >
                  <span className="text-xs font-semibold text-[#718096]">人数</span>
                </div>
                <div className="relative flex-1">
                  {hours.slice(0, -1).map((h) => {
                    const pctLeft = ((h - startHour) / totalHours) * 100
                    const pctWidth = (1 / totalHours) * 100
                    // この1時間に勤務中の人数をカウント（h:00〜h:59）
                    const hm = h * 60 + 30 // 時間帯の中心で判定
                    const count = working.filter((staff) => {
                      const userShifts = shiftsByUser.get(staff.id) ?? []
                      return userShifts.some((s) => {
                        const [sh, sm] = s.startTime.split(':').map(Number)
                        const [eh, em] = s.endTime.split(':').map(Number)
                        return sh * 60 + sm <= hm && eh * 60 + em > hm
                      })
                    }).length
                    return (
                      <div
                        key={h}
                        className="absolute top-0 h-full flex items-center justify-center border-l border-[#E2E8F0]/60"
                        style={{ left: `${pctLeft}%`, width: `${pctWidth}%` }}
                      >
                        <span className={cn('text-[10px] font-semibold', count > 0 ? 'text-[#1A202C]' : 'text-[#CBD5E0]')}>
                          {count > 0 ? count : '-'}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="shrink-0 border-l border-[#E2E8F0]" style={{ width: 56 }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {notWorking.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0]">
          <div className="px-4 py-3 bg-[#F8F9FA] border-b border-[#E2E8F0]">
            <h3 className="text-sm font-semibold text-[#718096]">休み {notWorking.length}名</h3>
          </div>
          <div className="px-4 py-3 flex flex-wrap gap-3">
            {notWorking.map((staff) => (
              <div key={staff.id} className="flex items-center gap-1.5 text-xs text-[#718096]">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: staff.color }} />
                {staff.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
