'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { CalendarDays, ClipboardList, Users } from 'lucide-react'

const links = [
  { label: 'シフト表', href: '/dashboard/schedule', icon: CalendarDays, description: 'シフトの確認・管理' },
  { label: 'シフト希望', href: '/dashboard/requests', icon: ClipboardList, description: 'スタッフからの希望一覧' },
  { label: 'スタッフ管理', href: '/dashboard/staff', icon: Users, description: 'スタッフの追加・編集' },
]

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'STAFF') {
      router.replace('/staff/myshift')
    }
  }, [session, status, router])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[#1A202C]">ダッシュボード</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {links.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="bg-white rounded-xl border border-[#E2E8F0] p-6 hover:border-[#0AB4CC] hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-[#E6F7FA] flex items-center justify-center group-hover:bg-[#0AB4CC] transition-colors">
                  <Icon className="w-5 h-5 text-[#0AB4CC] group-hover:text-white transition-colors" />
                </div>
                <h2 className="text-base font-semibold text-[#1A202C]">{item.label}</h2>
              </div>
              <p className="text-sm text-[#718096]">{item.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
