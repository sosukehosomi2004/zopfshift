'use client'

import { useState, useMemo } from 'react'
import { format, getDaysInMonth, getDay, isToday, addMonths, subMonths } from 'date-fns'
import { ja } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { ShiftBlock, type ShiftData } from './ShiftBlock'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface StaffMember {
  id: string
  name: string
  color: string
}

interface ShiftGridProps {
  staffList: StaffMember[]
  shifts: ShiftData[]
  initialMonth?: Date
  onMonthChange?: (date: Date) => void
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export function ShiftGrid({
  staffList,
  shifts,
  initialMonth,
  onMonthChange,
}: ShiftGridProps) {
  const [currentMonth, setCurrentMonth] = useState(initialMonth ?? new Date())

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const daysInMonth = getDaysInMonth(currentMonth)

  const days = useMemo(() =>
    Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
    [year, month, daysInMonth]
  )

  // スタッフ × 日付 でシフトをマッピング
  const shiftMap = useMemo(() => {
    const map = new Map<string, ShiftData[]>()
    for (const shift of shifts) {
      const d = format(new Date(shift.date ?? ''), 'yyyy-MM-dd')
      const key = `${shift.userId}__${d}`
      const existing = map.get(key) ?? []
      map.set(key, [...existing, shift])
    }
    return map
  }, [shifts])

  // 日付ごとのスタッフ数合計
  const dayTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const day of days) {
      const d = format(day, 'yyyy-MM-dd')
      let count = 0
      for (const staff of staffList) {
        if ((shiftMap.get(`${staff.id}__${d}`) ?? []).length > 0) count++
      }
      totals.set(d, count)
    }
    return totals
  }, [days, staffList, shiftMap])

  // スタッフごとの月間合計時間
  const staffTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const shift of shifts) {
      const [sh, sm] = shift.startTime.split(':').map(Number)
      const [eh, em] = shift.endTime.split(':').map(Number)
      const worked = (eh * 60 + em) - (sh * 60 + sm) - shift.breakTime
      totals.set(shift.userId, (totals.get(shift.userId) ?? 0) + worked)
    }
    return totals
  }, [shifts])

  return (
    <div className="flex flex-col gap-4">
      {/* ヘッダー: 月ナビゲーション */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => { const d = subMonths(currentMonth, 1); setCurrentMonth(d); onMonthChange?.(d) }}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-bold text-[#1A202C] w-32 text-center">
            {format(currentMonth, 'yyyy年M月', { locale: ja })}
          </h2>
          <Button variant="outline" size="icon" onClick={() => { const d = addMonths(currentMonth, 1); setCurrentMonth(d); onMonthChange?.(d) }}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* グリッド */}
      <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
        <table className="border-collapse text-sm" style={{ minWidth: `${180 + daysInMonth * 72}px` }}>
          <thead>
            <tr className="bg-[#F8F9FA]">
              {/* スタッフ名列ヘッダー */}
              <th className="sticky left-0 z-20 bg-[#F8F9FA] border-b border-r border-[#E2E8F0] px-4 py-2 text-left text-xs font-semibold text-[#718096] min-w-[140px]">
                スタッフ
              </th>
              {/* 日付ヘッダー */}
              {days.map((day) => {
                const dow = getDay(day)
                return (
                  <th
                    key={day.toISOString()}
                    className={cn(
                      'border-b border-r border-[#E2E8F0] px-1 py-2 text-center min-w-[68px]',
                      isToday(day) && 'bg-[#EBF2FF]',
                      dow === 6 && 'bg-blue-50',
                      dow === 0 && 'bg-red-50',
                    )}
                  >
                    <div className={cn(
                      'text-xs font-bold',
                      dow === 6 && 'text-blue-500',
                      dow === 0 && 'text-red-500',
                      isToday(day) && 'text-[#0AB4CC]',
                      dow !== 0 && dow !== 6 && !isToday(day) && 'text-[#1A202C]',
                    )}>
                      {format(day, 'd')}
                    </div>
                    <div className={cn(
                      'text-[10px]',
                      dow === 6 && 'text-blue-400',
                      dow === 0 && 'text-red-400',
                      dow !== 0 && dow !== 6 && 'text-[#718096]',
                    )}>
                      {DAY_LABELS[dow]}
                    </div>
                  </th>
                )
              })}
              {/* 合計列 */}
              <th className="border-b border-[#E2E8F0] px-3 py-2 text-center text-xs font-semibold text-[#718096] min-w-[60px]">
                合計
              </th>
            </tr>
          </thead>
          <tbody>
            {staffList.map((staff) => (
              <tr key={staff.id} className="hover:bg-[#F8F9FA]/50">
                {/* スタッフ名（左固定） */}
                <td className="sticky left-0 z-10 bg-white border-b border-r border-[#E2E8F0] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: staff.color }}
                    />
                    <span className="font-medium text-[#1A202C] text-xs truncate max-w-[100px]">
                      {staff.name}
                    </span>
                  </div>
                </td>

                {/* 日付セル */}
                {days.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd')
                  const key = `${staff.id}__${dateStr}`
                  const cellShifts = shiftMap.get(key) ?? []
                  const dow = getDay(day)

                  return (
                    <td
                      key={dateStr}
                      className={cn(
                        'border-b border-r border-[#E2E8F0] px-1 py-1 align-top',
                        isToday(day) && 'bg-[#EBF2FF]/40',
                        dow === 6 && 'bg-blue-50/40',
                        dow === 0 && 'bg-red-50/40',
                      )}
                    >
                      <div className="flex flex-col gap-0.5 min-h-[40px]">
                        {cellShifts.map((shift) => (
                          <ShiftBlock key={shift.id} shift={shift} />
                        ))}
                      </div>
                    </td>
                  )
                })}

                {/* 月間合計時間 */}
                <td className="border-b border-[#E2E8F0] px-3 py-2 text-center text-xs text-[#718096] font-medium">
                  {((staffTotals.get(staff.id) ?? 0) / 60).toFixed(1)}h
                </td>
              </tr>
            ))}

            {/* 合計行（人数） */}
            <tr className="bg-[#F8F9FA]">
              <td className="sticky left-0 z-10 bg-[#F8F9FA] border-t border-r border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#718096]">
                人数
              </td>
              {days.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const count = dayTotals.get(dateStr) ?? 0
                return (
                  <td key={dateStr} className="border-t border-r border-[#E2E8F0] px-1 py-2 text-center text-xs font-semibold text-[#1A202C]">
                    {count > 0 ? count : <span className="text-[#E2E8F0]">-</span>}
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
