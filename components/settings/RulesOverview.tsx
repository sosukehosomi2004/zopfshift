'use client'

import { useEffect, useState } from 'react'
import { Lock, AlertCircle, Info } from 'lucide-react'

type Slot = {
  id: string
  workplace: string
  name: string
  sortOrder: number
  skills: { skill: { name: string } }[]
  rules: { dayType: string; isRequired: boolean; groupKey: string | null }[]
}

const WP_LABEL: Record<string, string> = {
  FACTORY: '工場',
  CAFE: 'カフェ',
  FLOOR: 'フロア',
  OFFICE: '事務',
  OTHER: 'その他',
}

const DAY_LABEL: Record<string, string> = {
  WEEKDAY_MON_THU: '平日',
  FRIDAY: '金曜',
  HOLIDAY: '祝日',
}

export function RulesOverview() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/workplace-slots')
      .then((r) => r.ok ? r.json() : [])
      .then(setSlots)
      .finally(() => setLoading(false))
  }, [])

  const slotsByWp = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    if (!acc[s.workplace]) acc[s.workplace] = []
    acc[s.workplace].push(s)
    return acc
  }, {})

  return (
    <div className="space-y-6 text-sm">
      {/* HARD制約 */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <h3 className="font-semibold text-red-700">HARD制約 (違反すると生成不可)</h3>
        </div>
        <div className="bg-red-50/50 border border-red-100 rounded-lg overflow-hidden">
          <table className="w-full">
            <tbody>
              <tr className="border-b border-red-100">
                <td className="px-3 py-2 font-medium text-gray-700 w-48">連続勤務最大日数</td>
                <td className="px-3 py-2 text-gray-600">5日</td>
              </tr>
              <tr className="border-b border-red-100">
                <td className="px-3 py-2 font-medium text-gray-700">公休数最低</td>
                <td className="px-3 py-2 text-gray-600">月別設定 (上記「公休数設定」参照)</td>
              </tr>
              <tr className="border-b border-red-100">
                <td className="px-3 py-2 font-medium text-gray-700">勤務場所適性</td>
                <td className="px-3 py-2 text-gray-600">基本勤務地 + 移動可能勤務地のみ配置可</td>
              </tr>
              <tr className="border-b border-red-100">
                <td className="px-3 py-2 font-medium text-gray-700">工場 小松ライン</td>
                <td className="px-3 py-2 text-gray-600">主要5名 (上田・篠原・伊藤・福永・小松) のうち最低3名は工場勤務</td>
              </tr>
              <tr className="border-b border-red-100">
                <td className="px-3 py-2 font-medium text-gray-700">カフェ 習熟度</td>
                <td className="px-3 py-2 text-gray-600">▲(低) のスタッフがいる日は◎(高) のスタッフも必須</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium text-gray-700">フロア 習熟度</td>
                <td className="px-3 py-2 text-gray-600">▲(低) のスタッフは1日最大2名まで</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* SOFT制約 */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Info className="w-4 h-4 text-amber-600" />
          <h3 className="font-semibold text-amber-700">SOFT制約 (違反すると警告のみ)</h3>
        </div>
        <div className="bg-amber-50/50 border border-amber-100 rounded-lg overflow-hidden">
          <table className="w-full">
            <tbody>
              <tr className="border-b border-amber-100">
                <td className="px-3 py-2 font-medium text-gray-700 w-48">稼働人数</td>
                <td className="px-3 py-2 text-gray-600">下記「シフト生成ルール (稼働人数)」で編集</td>
              </tr>
              <tr className="border-b border-amber-100">
                <td className="px-3 py-2 font-medium text-gray-700">正社員最低数 (フロア)</td>
                <td className="px-3 py-2 text-gray-600">下記「シフト生成ルール (稼働人数)」で編集</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium text-gray-700">ポジションスロット未充足</td>
                <td className="px-3 py-2 text-gray-600">下記スロット定義の充足チェック</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ポジションスロット */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Lock className="w-4 h-4 text-gray-600" />
          <h3 className="font-semibold text-gray-700">ポジションスロット定義</h3>
        </div>
        {loading ? (
          <p className="text-xs text-gray-400">読み込み中...</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(slotsByWp).map(([wp, list]) => (
              <div key={wp} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-1.5 font-medium text-gray-700">
                  {WP_LABEL[wp] ?? wp}
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-white border-b border-gray-100">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-500">スロット名</th>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-500">必要スキル</th>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-500">適用曜日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => {
                      const requiredDays = s.rules.filter((r) => r.isRequired).map((r) => DAY_LABEL[r.dayType])
                      const groupKeys = Array.from(new Set(s.rules.filter((r) => r.groupKey).map((r) => r.groupKey)))
                      const groupLabel = groupKeys.length > 0 ? `グループ: ${groupKeys.join(', ')}` : ''
                      return (
                        <tr key={s.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-1.5 text-gray-900">{s.name}</td>
                          <td className="px-3 py-1.5 text-gray-600">
                            {s.skills.map((sk) => sk.skill.name).join(' / ') || '-'}
                          </td>
                          <td className="px-3 py-1.5 text-gray-500">
                            {requiredDays.length > 0 ? requiredDays.join(' / ') : '-'}
                            {groupLabel && <span className="ml-2 text-amber-600">{groupLabel}</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 pt-2 border-t">
        ※ HARD制約・スロット定義は現状コード/DBで固定です。変更が必要な場合は管理者へご連絡ください。
      </p>
    </div>
  )
}
