'use client'

import { cn } from '@/lib/utils'

export interface ShiftData {
  id: string
  userId: string
  date: string
  startTime: string
  endTime: string
  breakTime: number
  status: 'CONFIRMED' | 'TENTATIVE' | 'ABSENT'
  memo?: string | null
  user: { id: string; name: string; avatarUrl?: string | null }
  position?: { id: string; name: string; color: string } | null
  storeUserColor?: string
  requestStatus?: 'PENDING' | 'TENTATIVE' | 'APPROVED' | 'REJECTED'
}

const statusStyle = {
  CONFIRMED: 'opacity-100',
  TENTATIVE: 'opacity-70 border-dashed',
  ABSENT: 'opacity-50 line-through',
}

export function ShiftBlock({ shift }: { shift: ShiftData }) {
  const workMin =
    (() => {
      const [sh, sm] = shift.startTime.split(':').map(Number)
      const [eh, em] = shift.endTime.split(':').map(Number)
      return (eh * 60 + em) - (sh * 60 + sm) - shift.breakTime
    })()
  const workHours = (workMin / 60).toFixed(1)

  return (
    <div
      style={{ backgroundColor: shift.position?.color ?? '#0AB4CC' }}
      className={cn(
        'rounded-md px-2 py-1 text-white text-xs select-none border border-white/20',
        statusStyle[shift.status],
      )}
    >
      <div className="font-semibold truncate">{shift.startTime}〜{shift.endTime}</div>
      {shift.position && (
        <div className="truncate text-white/80">{shift.position.name}</div>
      )}
      <div className="text-white/70">{workHours}h</div>
    </div>
  )
}
