'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Trash2, ChevronUp, ChevronDown, ChevronsUpDown, Search } from 'lucide-react'

export interface StaffMember {
  id: string
  name: string
  nameKana?: string | null
  email: string
  role: string
  storeRole: string
  color: string
  maxHours?: number | null
  minHours?: number | null
  monthlyMinutes: number
  createdAt: string
}

type SortKey = 'name' | 'role' | 'monthlyMinutes' | 'createdAt'
type SortDir = 'asc' | 'desc'

const ROLE_ORDER: Record<string, number> = { OWNER: 0, MANAGER: 1, STAFF: 2 }
const ROLE_COLOR: Record<string, string> = { OWNER: '#8B5CF6', MANAGER: '#F59E0B', STAFF: '#0AB4CC' }

interface StaffTableProps {
  staff: StaffMember[]
  onDelete: (userId: string) => void
}

const roleLabel = (role: string) => {
  if (role === 'OWNER') return { label: 'オーナー', variant: 'default' as const }
  if (role === 'MANAGER') return { label: 'マネージャー', variant: 'secondary' as const }
  return { label: 'スタッフ', variant: 'outline' as const }
}

export function StaffTable({ staff, onDelete }: StaffTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [query, setQuery] = useState('')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = query.trim()
    ? staff.filter((m) => {
        const q = query.trim().toLowerCase()
        return (
          m.name.toLowerCase().includes(q) ||
          (m.nameKana ?? '').toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
        )
      })
    : staff

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name') {
      const aKey = a.nameKana ?? a.name
      const bKey = b.nameKana ?? b.name
      cmp = aKey < bKey ? -1 : aKey > bKey ? 1 : 0
    } else if (sortKey === 'role') {
      cmp = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
    } else if (sortKey === 'monthlyMinutes') {
      cmp = a.monthlyMinutes - b.monthlyMinutes
    } else if (sortKey === 'createdAt') {
      cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronsUpDown className="w-3 h-3 ml-1 inline opacity-40" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 ml-1 inline text-[#0AB4CC]" />
      : <ChevronDown className="w-3 h-3 ml-1 inline text-[#0AB4CC]" />
  }

  if (staff.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
        <p className="text-[#718096]">スタッフが登録されていません</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0AEC0]" />
        <input
          type="text"
          placeholder="名前・よみかた・メールで検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:border-[#0AB4CC] focus:ring-1 focus:ring-[#0AB4CC]"
        />
      </div>
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F8F9FA] border-b border-[#E2E8F0]">
            <th className="text-left px-4 py-3 text-xs font-semibold text-[#718096] cursor-pointer select-none hover:text-[#1A202C]" onClick={() => handleSort('name')}>
              スタッフ<SortIcon k="name" />
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-[#718096] cursor-pointer select-none hover:text-[#1A202C]" onClick={() => handleSort('role')}>
              役割<SortIcon k="role" />
            </th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-[#718096]">メール</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-[#718096] cursor-pointer select-none hover:text-[#1A202C]" onClick={() => handleSort('monthlyMinutes')}>
              今月の勤務時間<SortIcon k="monthlyMinutes" />
            </th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-[#718096]">月間時間（下限〜上限）</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-[#718096] cursor-pointer select-none hover:text-[#1A202C]" onClick={() => handleSort('createdAt')}>
              入社日<SortIcon k="createdAt" />
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E2E8F0]">
          {sorted.map((member) => {
            const { label, variant } = roleLabel(member.role)
            const monthlyHours = (member.monthlyMinutes / 60).toFixed(1)
            const initials = member.name.slice(0, 2)

            return (
              <tr key={member.id} className="hover:bg-[#F8F9FA]/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback
                        className="text-white text-xs font-semibold"
                        style={{ backgroundColor: ROLE_COLOR[member.role] ?? '#718096' }}
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-[#1A202C]">{member.name}</div>
                      {member.nameKana && (
                        <div className="text-xs text-[#718096]">{member.nameKana}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={variant}>{label}</Badge>
                </td>
                <td className="px-4 py-3 text-[#718096]">{member.email}</td>
                <td className="px-4 py-3 text-center">
                  <span className="font-semibold text-[#1A202C]">{monthlyHours}h</span>
                </td>
                <td className="px-4 py-3 text-center text-xs text-[#718096]">
                  {member.minHours != null || member.maxHours != null ? (
                    <span>{member.minHours ?? '—'}〜{member.maxHours ?? '—'}h</span>
                  ) : (
                    <span>未設定</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-xs text-[#718096]">
                  {new Date(member.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(member.id)}
                    className="text-[#718096] hover:text-[#EF4444] hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </div>
  )
}
