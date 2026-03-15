'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { RequestCalendar, ShiftRequest } from '@/components/request/RequestCalendar'
import { useSocket } from '@/hooks/useSocket'

const STORE_ID = 'store1' // TODO: セッションから取得

export default function StaffRequestPage() {
  const { data: session } = useSession()
  const [requests, setRequests] = useState<ShiftRequest[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const socketRef = useSocket(STORE_ID)

  // 承認/却下をリアルタイム反映
  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return
    const onUpdated = (r: ShiftRequest) => {
      setRequests((prev) => prev.map((p) => (p.id === r.id ? { ...p, status: r.status } : p)))
    }
    socket.on('request:updated', onUpdated)
    return () => { socket.off('request:updated', onUpdated) }
  }, [socketRef])

  const fetchRequests = useCallback(async () => {
    if (!session?.user?.id) return
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1
    const res = await fetch(
      `/api/stores/${STORE_ID}/requests?userId=${session.user.id}&year=${year}&month=${month}`
    )
    if (res.ok) {
      const data = await res.json()
      setRequests(data)
    }
  }, [session?.user?.id, currentMonth])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const handleSubmit = async (
    date: string,
    startTime: string,
    endTime: string,
    memo?: string
  ) => {
    const res = await fetch(`/api/stores/${STORE_ID}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, startTime, endTime, memo }),
    })
    if (res.ok) {
      await fetchRequests()
    }
  }

  const handleDelete = async (requestId: string) => {
    const res = await fetch(`/api/stores/${STORE_ID}/requests/${requestId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      await fetchRequests()
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A202C]">シフト希望提出</h1>
        <p className="text-sm text-[#718096] mt-1">
          希望する日付をタップして、勤務時間を入力してください
        </p>
      </div>

      <RequestCalendar
        requests={requests}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        onMonthChange={setCurrentMonth}
      />
    </div>
  )
}
