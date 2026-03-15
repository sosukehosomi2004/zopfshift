'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import {
  CalendarDays,
  LayoutDashboard,
  Users,
  ClipboardList,
  Settings,
  HelpCircle,
  LogOut,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

const managerNav: NavItem[] = [
  { label: 'ダッシュボード', href: '/dashboard', icon: LayoutDashboard },
  { label: 'シフト表', href: '/dashboard/schedule', icon: CalendarDays },
  { label: 'シフト希望', href: '/dashboard/requests', icon: ClipboardList },
  { label: 'スタッフ管理', href: '/dashboard/staff', icon: Users },
]

const staffNav: NavItem[] = [
  { label: 'マイシフト', href: '/staff/myshift', icon: CalendarDays },
  { label: '希望提出', href: '/staff/request', icon: ClipboardList },
]

const bottomItems: NavItem[] = [
  { label: '設定', href: '/settings/store', icon: Settings },
  { label: 'ヘルプ', href: '#', icon: HelpCircle },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = session?.user?.role ?? 'STAFF'
  const isStaff = role === 'STAFF'
  const navItems = isStaff ? staffNav : managerNav

  return (
    <aside className="fixed left-0 top-0 h-screen w-11 bg-[#1E2A3B] flex flex-col z-30">
      {/* Logo */}
      <div className="h-12 flex items-center justify-center border-b border-white/10">
        <div className="w-7 h-7 rounded flex items-center justify-center bg-[#0AB4CC]">
          <CalendarDays className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col items-center py-2 gap-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                'group relative w-full flex items-center justify-center h-10 transition-colors',
                isActive
                  ? 'bg-white/10 text-[#0AB4CC]'
                  : 'text-white/50 hover:bg-white/5 hover:text-white'
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-0 h-full w-0.5 bg-[#0AB4CC] rounded-r" />
              )}
              <Icon className="w-4 h-4" />
              <span className="pointer-events-none absolute left-12 whitespace-nowrap bg-[#1E2A3B] text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 border border-white/10">
                {item.label}
              </span>
            </Link>
          )
        })}

        {/* ロールバッジ */}
        <div className="mt-2 w-full flex justify-center">
          <span className="text-[9px] text-white/30 font-medium tracking-wide">
            {isStaff ? 'STAFF' : role === 'OWNER' ? 'OWNER' : 'MGR'}
          </span>
        </div>
      </nav>

      {/* Bottom */}
      <div className="flex flex-col items-center pb-2 gap-0.5 border-t border-white/10 pt-2">
        {!isStaff && bottomItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className="group relative w-full flex items-center justify-center h-10 text-white/50 hover:bg-white/5 hover:text-white transition-colors"
            >
              <Icon className="w-4 h-4" />
              <span className="pointer-events-none absolute left-12 whitespace-nowrap bg-[#1E2A3B] text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 border border-white/10">
                {item.label}
              </span>
            </Link>
          )
        })}
        {isStaff && (
          <Link
            href="/settings/account"
            title="設定"
            className="group relative w-full flex items-center justify-center h-10 text-white/50 hover:bg-white/5 hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span className="pointer-events-none absolute left-12 whitespace-nowrap bg-[#1E2A3B] text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 border border-white/10">
              設定
            </span>
          </Link>
        )}
        <button
          title="ログアウト"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="group relative w-full flex items-center justify-center h-10 text-white/50 hover:bg-white/5 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="pointer-events-none absolute left-12 whitespace-nowrap bg-[#1E2A3B] text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 border border-white/10">
            ログアウト
          </span>
        </button>
      </div>
    </aside>
  )
}
