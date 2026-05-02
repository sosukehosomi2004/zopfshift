'use client'

import { PasswordChangeForm } from '@/components/account/PasswordChangeForm'

export default function AccountSettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">アカウント設定</h1>
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-semibold">自分のパスワード変更</h2>
        <p className="text-xs text-gray-400 mb-3">ログイン中のアカウントのパスワードを変更します。</p>
        <PasswordChangeForm />
      </section>
    </div>
  )
}
