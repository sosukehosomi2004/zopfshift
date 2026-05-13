'use client'

import { useState, ReactNode } from 'react'
import { HelpCircle, X } from 'lucide-react'

type Props = {
  title: string
  children: ReactNode
}

/**
 * 各ページのヘッダー横に置いて「?」アイコンでヘルプモーダルを開くコンポーネント。
 * 使用例:
 *   <PageHelp title="シフト管理 - ヘルプ">
 *     <h3>このページでできること</h3>
 *     ...
 *   </PageHelp>
 */
export function PageHelp({ title, children }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-gray-400 hover:text-[#0AB4CC] hover:bg-[#0AB4CC]/10 transition-colors"
        title="ヘルプ"
        aria-label="ヘルプを開く"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b bg-[#F8FAFB]">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-[#0AB4CC]" />
                {title}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="閉じる"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 prose prose-sm max-w-none text-gray-700 [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:text-sm [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold [&_h4]:text-gray-800 [&_h4]:text-xs [&_ul]:mt-1 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-1 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_p]:my-2 [&_strong]:font-semibold [&_strong]:text-gray-900 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs">
              {children}
            </div>
            <div className="px-6 py-3 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-1.5 text-sm bg-[#0AB4CC] text-white rounded-lg hover:bg-[#099bb0]"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
