'use client'

import { useState, useEffect, useRef } from 'react'
import { format, getDay, getDaysInMonth, isToday as isTodayFn } from 'date-fns'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const DAY_LABELS_SHORT = ['月', '火', '水', '木', '金', '土', '日']

export function DatePickerButton({
  value,
  onChange,
  size = 'default',
}: {
  value: Date
  onChange: (d: Date) => void
  size?: 'default' | 'sm'
}) {
  const [open, setOpen] = useState(false)
  const [calMonth, setCalMonth] = useState(new Date(value.getFullYear(), value.getMonth(), 1))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    setCalMonth(new Date(value.getFullYear(), value.getMonth(), 1))
  }, [value])

  const year = calMonth.getFullYear()
  const month = calMonth.getMonth()
  const daysInMonth = getDaysInMonth(calMonth)
  const firstDow = (getDay(new Date(year, month, 1)) + 6) % 7
  const cells: (number | null)[] = Array.from({ length: firstDow }, () => null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedStr = format(value, 'yyyy-MM-dd')
  const btnSize = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="icon"
        className={cn(btnSize, 'text-[#718096]')}
        onClick={() => setOpen(!open)}
      >
        <Calendar className={iconSize} />
      </Button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-lg border border-[#E2E8F0] shadow-lg p-3 z-50" style={{ width: 280 }}>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setCalMonth(new Date(year, month - 1, 1))} className="p-1 hover:bg-[#F8F9FA] rounded">
              <ChevronLeft className="w-4 h-4 text-[#718096]" />
            </button>
            <span className="text-sm font-semibold text-[#1A202C]">{year}年{month + 1}月</span>
            <button onClick={() => setCalMonth(new Date(year, month + 1, 1))} className="p-1 hover:bg-[#F8F9FA] rounded">
              <ChevronRight className="w-4 h-4 text-[#718096]" />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS_SHORT.map((d, i) => (
              <div key={d} className={cn('text-center text-[10px] font-medium py-0.5', i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-[#718096]')}>
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />
              const dateStr = format(new Date(year, month, day), 'yyyy-MM-dd')
              const isSelected = dateStr === selectedStr
              const isToday = isTodayFn(new Date(year, month, day))
              const dow = i % 7
              return (
                <button
                  key={i}
                  onClick={() => { onChange(new Date(year, month, day)); setOpen(false) }}
                  className={cn(
                    'h-8 text-xs rounded hover:bg-[#E6F7FA] transition-colors',
                    isSelected && 'bg-[#0AB4CC] text-white hover:bg-[#0AB4CC]',
                    isToday && !isSelected && 'font-bold text-[#0AB4CC]',
                    !isSelected && !isToday && dow === 5 && 'text-blue-500',
                    !isSelected && !isToday && dow === 6 && 'text-red-500',
                    !isSelected && !isToday && dow < 5 && 'text-[#1A202C]',
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => { onChange(new Date()); setOpen(false) }}
            className="w-full mt-2 py-1.5 text-xs text-[#0AB4CC] hover:bg-[#E6F7FA] rounded transition-colors font-medium"
          >
            今日に戻る
          </button>
        </div>
      )}
    </div>
  )
}
