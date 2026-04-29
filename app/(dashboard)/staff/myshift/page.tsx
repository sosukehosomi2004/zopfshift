'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns'
import { ja } from 'date-fns/locale'

type Assignment = {
  date: string
  workplace: string
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']
const WORKPLACE_LABELS: Record<string, string> = {
  FACTORY: '工場', CAFE: 'カフェ', FLOOR: 'フロア', OFFICE: '事務', OTHER: 'その他',
}

export default function MyShiftPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [assignments, setAssignments] = useState<Assignment[]>([])

  const fetchShifts = useCallback(async () => {
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
    const res = await fetch(`/api/shifts/my?startDate=${start}&endDate=${end}`)
    if (res.ok) setAssignments(await res.json())
  }, [currentMonth])

  useEffect(() => { fetchShifts() }, [fetchShifts])

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })
  const startDayOfWeek = getDay(startOfMonth(currentMonth))

  const assignmentMap = useMemo(() => {
    const map = new Map<string, Assignment>()
    for (const a of assignments) {
      map.set(a.date.split('T')[0], a)
    }
    return map
  }, [assignments])

  const workDays = assignments.length
  const offDays = days.length - workDays

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">マイシフト</h1>
      <p className="text-sm text-gray-400 mb-6">
        出勤 {workDays}日 / 休み {offDays}日
      </p>

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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
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
            const dateStr = format(day, 'yyyy-MM-dd')
            const a = assignmentMap.get(dateStr)
            const dow = getDay(day)
            const isWork = !!a

            return (
              <div
                key={dateStr}
                className={`aspect-square flex flex-col items-center justify-center rounded-lg text-sm ${
                  isWork
                    ? 'bg-[#0AB4CC]/10 text-[#0AB4CC] font-medium'
                    : 'text-gray-300'
                } ${dow === 0 && !isWork ? 'text-red-200' : ''} ${dow === 6 && !isWork ? 'text-blue-200' : ''}`}
              >
                <span>{format(day, 'd')}</span>
                {isWork && (
                  <span className="text-[9px] mt-0.5">{WORKPLACE_LABELS[a.workplace] ?? ''}</span>
                )}
                {!isWork && <span className="text-[9px] mt-0.5">休</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
