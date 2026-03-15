'use client'

import { NotificationBell } from './NotificationBell'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, User } from 'lucide-react'
import { signOut } from 'next-auth/react'

interface HeaderProps {
  userName?: string
}

export function Header({ userName = 'ユーザー' }: HeaderProps) {
  const initials = userName.slice(0, 2)

  return (
    <header className="fixed top-0 left-60 right-0 h-14 bg-white border-b border-[#E2E8F0] flex items-center justify-end px-6 gap-3 z-20">
      <NotificationBell />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 p-1 rounded-lg hover:bg-[#F8F9FA] transition-colors">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-[#0AB4CC] text-white text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-[#1A202C] hidden sm:block">{userName}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <a href="/settings/account" className="flex items-center gap-2 cursor-pointer">
              <User className="w-4 h-4" />
              アカウント設定
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-2 text-[#EF4444] cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            ログアウト
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
