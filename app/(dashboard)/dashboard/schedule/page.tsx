'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths, startOfWeek, endOfWeek } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePickerButton } from '@/components/ui/DatePickerButton'
import { ShiftCalendarView, type ViewMode } from '@/components/schedule/ShiftCalendarView'
import type { ShiftData } from '@/components/schedule/ShiftBlock'

const STORE_ID = 'store1'

interface StaffMember {
  id: string
  name: string
  nameKana?: string
  color: string
}

// ─── モックデータ（DB未接続時の表示確認用）────────────────────────────────
const MOCK_STAFF: StaffMember[] = [
  { id: 'u1', name: '田中 太郎', color: '#0AB4CC' },
  { id: 'u2', name: '鈴木 花子', color: '#0AB4CC' },
  { id: 'u3', name: '佐藤 次郎', color: '#0AB4CC' },
  { id: 'u4', name: '山田 三郎', color: '#0AB4CC' },
  { id: 'u5', name: '伊藤 美咲', color: '#0AB4CC' },
]

function makeMockData(): ShiftData[] {
  const year = new Date().getFullYear()
  const month = new Date().getMonth()
  const patterns = [
    { startTime: '09:00', endTime: '17:00' },
    { startTime: '10:00', endTime: '18:00' },
    { startTime: '11:00', endTime: '19:00' },
    { startTime: '17:00', endTime: '22:00' },
  ]
  // 確定シフト
  const confirmed: [string, number, number][] = [
    ['u1', 1, 0], ['u1', 5, 1], ['u2', 2, 2], ['u2', 6, 0],
    ['u3', 3, 1], ['u3', 7, 3], ['u4', 1, 2], ['u4', 4, 0],
    ['u5', 2, 3], ['u5', 6, 1],
  ]
  // シフト希望
  const requests: [string, number, number, 'PENDING' | 'APPROVED' | 'REJECTED'][] = [
    ['u1',  8, 1, 'PENDING'],  ['u1', 14, 2, 'REJECTED'], ['u1', 19, 0, 'APPROVED'],
    ['u2',  9, 0, 'APPROVED'], ['u2', 15, 3, 'PENDING'],
    ['u3', 10, 1, 'REJECTED'], ['u3', 17, 0, 'APPROVED'], ['u3', 21, 2, 'PENDING'],
    ['u4', 11, 2, 'APPROVED'], ['u4', 18, 1, 'PENDING'],
    ['u5', 13, 1, 'PENDING'],  ['u5', 20, 3, 'REJECTED'],
  ]
  const result: ShiftData[] = []
  confirmed.forEach(([userId, day, patIdx], i) => {
    const staff = MOCK_STAFF.find(s => s.id === userId)!
    const p = patterns[patIdx]
    result.push({
      id: `mock-s${i}`,
      userId,
      date: new Date(year, month, day + 1).toISOString(),
      startTime: p.startTime,
      endTime: p.endTime,
      breakTime: 60,
      status: 'CONFIRMED' as const,
      user: { id: userId, name: staff.name },
    })
  })
  requests.forEach(([userId, day, patIdx, requestStatus], i) => {
    const staff = MOCK_STAFF.find(s => s.id === userId)!
    const p = patterns[patIdx]
    result.push({
      id: `mock-r${i}`,
      userId,
      date: new Date(year, month, day + 1).toISOString(),
      startTime: p.startTime,
      endTime: p.endTime,
      breakTime: 0,
      status: 'CONFIRMED' as const,
      user: { id: userId, name: staff.name },
      requestStatus,
    })
  })
  return result
}

const MOCK_DATA = makeMockData()

export default function SchedulePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [viewMode, setViewMode] = useState<ViewMode>('週')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [shifts, setShifts] = useState<ShiftData[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'STAFF') {
      router.replace('/staff/myshift')
    }
  }, [session, status, router])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1

    type SegmentRow = {
      id: string; startTime: string; endTime: string; isBreak: boolean
      position?: { id: string; name: string; color: string } | null
    }
    type RequestRow = {
      id: string; date: string; startTime: string; endTime: string
      status: 'PENDING' | 'TENTATIVE' | 'APPROVED' | 'REJECTED'
      user: { id: string; name: string }
      segments: SegmentRow[]
    }

    try {
      const [requestsRes, staffRes] = await Promise.all([
        fetch(`/api/stores/${STORE_ID}/requests?year=${year}&month=${month}`),
        fetch(`/api/stores/${STORE_ID}/staff`),
      ])

      const allShifts: ShiftData[] = []

      if (requestsRes.ok) {
        const requests = await requestsRes.json() as RequestRow[]
        for (const r of requests) {
          if ((r.status === 'APPROVED' || r.status === 'TENTATIVE') && r.segments.length > 0) {
            // APPROVED/TENTATIVE: セグメントを個別の ShiftData に展開（休憩は除外）
            for (const seg of r.segments) {
              if (seg.isBreak) continue
              allShifts.push({
                id: seg.id,
                userId: r.user.id,
                date: r.date,
                startTime: seg.startTime,
                endTime: seg.endTime,
                breakTime: 0,
                status: 'CONFIRMED',
                user: r.user,
                position: seg.position ?? undefined,
                requestStatus: r.status === 'TENTATIVE' ? 'TENTATIVE' : undefined,
              })
            }
          } else {
            // PENDING / REJECTED: リクエストそのまま1本のバーで表示
            allShifts.push({
              id: r.id,
              userId: r.user.id,
              date: r.date,
              startTime: r.startTime,
              endTime: r.endTime,
              breakTime: 0,
              status: 'CONFIRMED',
              user: r.user,
              requestStatus: r.status,
            })
          }
        }
      }

      setShifts(allShifts.length > 0 ? allShifts : MOCK_DATA)

      if (staffRes.ok) {
        const data = await staffRes.json()
        setStaffList(data.map((s: { id: string; name: string; nameKana?: string; color: string }) => ({
          id: s.id, name: s.name, nameKana: s.nameKana, color: s.color,
        })))
      } else {
        setStaffList(MOCK_STAFF)
      }
    } catch {
      setShifts(MOCK_DATA)
      setStaffList(MOCK_STAFF)
    }
    setLoading(false)
  }, [currentDate])

  useEffect(() => { fetchData() }, [fetchData])

  const navigate = (dir: 1 | -1) => {
    if (viewMode === '日') setCurrentDate(d => dir === 1 ? addDays(d, 1) : subDays(d, 1))
    else if (viewMode === '週') setCurrentDate(d => dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1))
    else setCurrentDate(d => dir === 1 ? addMonths(d, 1) : subMonths(d, 1))
  }

  const getDisplayLabel = () => {
    if (viewMode === '日') return format(currentDate, 'yyyy年M月d日（E）', { locale: ja })
    if (viewMode === '週') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 })
      const end = endOfWeek(currentDate, { weekStartsOn: 1 })
      return `${format(start, 'yyyy年M月d日', { locale: ja })} 〜 ${format(end, 'M月d日', { locale: ja })}`
    }
    return format(currentDate, 'yyyy年M月', { locale: ja })
  }



  return (
    <div className="space-y-4">
      {/* コントロールバー */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* ビュー切り替え */}
        <div className="flex rounded-lg border border-[#E2E8F0] overflow-hidden bg-white">
          {(['日', '週', '月'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-5 py-2 text-sm font-medium transition-colors border-r border-[#E2E8F0] last:border-r-0 ${
                viewMode === mode
                  ? 'bg-[#0AB4CC] text-white'
                  : 'text-[#718096] hover:bg-[#F8F9FA]'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* 日付ナビゲーション */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold text-[#1A202C] min-w-[220px] text-center">
            {getDisplayLabel()}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <DatePickerButton
            value={currentDate}
            onChange={(d) => setCurrentDate(d)}
          />
        </div>
      </div>

      {/* メインコンテンツ */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-[#718096]">読み込み中...</div>
        </div>
      ) : (
        <ShiftCalendarView
          viewMode={viewMode}
          currentDate={currentDate}
          staffList={staffList}
          shifts={shifts}
          onMonthChange={setCurrentDate}
        />
      )}
    </div>
  )
}
