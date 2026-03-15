'use client'

import { Bell } from 'lucide-react'
import { useState } from 'react'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const unreadCount = 3 // TODO: 実データに置き換え

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-[#F8F9FA] transition-colors"
        aria-label="通知"
      >
        <Bell className="w-5 h-5 text-[#718096]" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-[#EF4444] rounded-full text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-lg border border-[#E2E8F0] z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]">
              <span className="font-semibold text-sm text-[#1A202C]">通知</span>
              <button className="text-xs text-[#0AB4CC] hover:underline">すべて既読</button>
            </div>
            <div className="divide-y divide-[#E2E8F0] max-h-80 overflow-y-auto">
              {[1, 2, 3].map((i) => (
                <div key={i} className="px-4 py-3 hover:bg-[#F8F9FA] cursor-pointer">
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#0AB4CC] mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm text-[#1A202C]">シフト希望が提出されました</p>
                      <p className="text-xs text-[#718096] mt-0.5">田中太郎 · 5分前</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2 border-t border-[#E2E8F0]">
              <button className="w-full text-xs text-[#0AB4CC] text-center hover:underline py-1">
                すべての通知を見る
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
