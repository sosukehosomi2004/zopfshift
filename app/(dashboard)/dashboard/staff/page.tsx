'use client'

import { useState, useEffect, useCallback } from 'react'
import { StaffTable, type StaffMember } from '@/components/staff/StaffTable'
import { StaffInviteModal } from '@/components/staff/StaffInviteModal'
import { Button } from '@/components/ui/button'
import { UserPlus } from 'lucide-react'

const STORE_ID = 'store1'

export default function StaffPage() {
  const params = { storeId: STORE_ID }
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)

  const fetchStaff = useCallback(async () => {
    const res = await fetch(`/api/stores/${params.storeId}/staff`)
    if (res.ok) {
      setStaff(await res.json())
    }
    setLoading(false)
  }, [params.storeId])

  useEffect(() => { fetchStaff() }, [fetchStaff])

  const handleInvite = async (data: { name: string; email: string; role: 'ADMIN' | 'STAFF'; color: string }) => {
    const res = await fetch(`/api/stores/${params.storeId}/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) await fetchStaff()
  }

  const handleDelete = async (userId: string) => {
    if (!confirm('このスタッフを店舗から削除しますか？')) return
    const res = await fetch(`/api/stores/${params.storeId}/staff/${userId}`, {
      method: 'DELETE',
    })
    if (res.ok) await fetchStaff()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A202C]">スタッフ管理</h1>
          <p className="text-sm text-[#718096] mt-1">{staff.length}名のスタッフ</p>
        </div>
        <Button
          onClick={() => setInviteOpen(true)}
          className="bg-[#0AB4CC] hover:bg-[#0099B0] text-white gap-2"
        >
          <UserPlus className="w-4 h-4" />
          スタッフを追加
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-[#718096]">読み込み中...</div>
        </div>
      ) : (
        <StaffTable staff={staff} onDelete={handleDelete} />
      )}

      <StaffInviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={handleInvite}
      />
    </div>
  )
}
