'use client'

import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'

type DayType = 'WEEKDAY_MON_THU' | 'FRIDAY' | 'HOLIDAY'
type Workplace = 'FACTORY' | 'CAFE' | 'FLOOR'

type Rule = {
  workplace: Workplace
  dayType: DayType
  requiredCount: number
  minFullTimeCount: number | null
  baseFullTimeCount: number | null
}

const WORKPLACES: Workplace[] = ['FACTORY', 'CAFE', 'FLOOR']
const DAY_TYPES: DayType[] = ['WEEKDAY_MON_THU', 'FRIDAY', 'HOLIDAY']

const WP_LABEL: Record<Workplace, string> = { FACTORY: '工場', CAFE: 'カフェ', FLOOR: 'フロア' }
const DAY_LABEL: Record<DayType, string> = {
  WEEKDAY_MON_THU: '平日 (月-木)',
  FRIDAY: '金曜',
  HOLIDAY: '休日 (土日・祝日)',
}

// FLOOR のみ minFullTimeCount を編集対象とする (現状の仕様)
const HAS_FT_MIN: Record<Workplace, boolean> = {
  FACTORY: false,
  CAFE: false,
  FLOOR: true,
}

export function StaffingRulesEditor() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchRules = async () => {
    setLoading(true)
    const res = await fetch('/api/staffing-rules')
    if (res.ok) {
      const data: Rule[] = await res.json()
      // 全組み合わせを補完 (DBに無くてもUIに出す)
      const filled: Rule[] = []
      for (const wp of WORKPLACES) {
        for (const dt of DAY_TYPES) {
          const found = data.find((r) => r.workplace === wp && r.dayType === dt)
          filled.push(
            found ?? {
              workplace: wp,
              dayType: dt,
              requiredCount: 0,
              minFullTimeCount: HAS_FT_MIN[wp] ? 0 : null,
              baseFullTimeCount: HAS_FT_MIN[wp] ? 0 : null,
            },
          )
        }
      }
      setRules(filled)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchRules()
  }, [])

  const updateField = (
    workplace: Workplace,
    dayType: DayType,
    field: 'requiredCount' | 'minFullTimeCount' | 'baseFullTimeCount',
    value: number,
  ) => {
    setRules((prev) =>
      prev.map((r) => (r.workplace === workplace && r.dayType === dayType ? { ...r, [field]: value } : r)),
    )
  }

  const getRule = (wp: Workplace, dt: DayType): Rule | undefined =>
    rules.find((r) => r.workplace === wp && r.dayType === dt)

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    const res = await fetch('/api/staffing-rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules }),
    })
    setSaving(false)
    if (res.ok) {
      setMessage({ type: 'success', text: '保存しました。次回シフト生成から反映されます。' })
    } else {
      setMessage({ type: 'error', text: '保存に失敗しました' })
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400">読み込み中...</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        各勤務場所×曜日タイプの必要人数を設定します。フロアのみ正社員最低数も設定できます。
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-3 py-2 font-medium text-gray-500">勤務場所</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">曜日タイプ</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">必要人数</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">正社員最低数</th>
            </tr>
          </thead>
          <tbody>
            {WORKPLACES.flatMap((wp) =>
              DAY_TYPES.map((dt, dtIdx) => {
                const rule = getRule(wp, dt)
                if (!rule) return null
                return (
                  <tr key={`${wp}-${dt}`} className={dtIdx === 0 ? 'border-t-2 border-gray-200' : 'border-b border-gray-50'}>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {dtIdx === 0 ? WP_LABEL[wp] : ''}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{DAY_LABEL[dt]}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={rule.requiredCount}
                        onChange={(e) => updateField(wp, dt, 'requiredCount', Number(e.target.value))}
                        className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20 focus:border-[#0AB4CC]"
                      />
                      <span className="ml-1 text-xs text-gray-500">名</span>
                    </td>
                    <td className="px-3 py-2">
                      {HAS_FT_MIN[wp] ? (
                        <>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={rule.minFullTimeCount ?? 0}
                            onChange={(e) => updateField(wp, dt, 'minFullTimeCount', Number(e.target.value))}
                            className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20 focus:border-[#0AB4CC]"
                          />
                          <span className="ml-1 text-xs text-gray-500">名</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              }),
            )}
          </tbody>
        </table>
      </div>

      {message && (
        <div
          className={`text-sm px-3 py-2 rounded ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 bg-[#0AB4CC] text-white px-4 py-2 rounded-lg hover:bg-[#099bb0] text-sm font-medium disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {saving ? '保存中...' : '保存'}
      </button>
    </div>
  )
}
