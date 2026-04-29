'use client'

import { useState, useEffect } from 'react'
import { X, Check } from 'lucide-react'

type Skill = {
  id: string
  workplace: string
  name: string
}

type Employee = {
  id: string
  lastName: string
  firstName: string
  primaryWorkplace: string
  secondaryWorkplaces: { workplace: string }[]
  skills: { skill: Skill }[]
}

type Props = {
  employee: Employee
  onClose: () => void
  onSaved: () => void
}

const WORKPLACE_LABELS: Record<string, string> = {
  FACTORY: '工場',
  CAFE: 'カフェ',
  FLOOR: 'フロア',
  OFFICE: '事務',
  OTHER: 'その他',
}

export function EmployeeSkillModal({ employee, onClose, onSaved }: Props) {
  const [allSkills, setAllSkills] = useState<Skill[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(employee.skills.map((es) => es.skill.id))
  )
  const [saving, setSaving] = useState(false)

  // この従業員に関連する勤務場所のスキルを取得
  const relevantWorkplaces = [
    employee.primaryWorkplace,
    ...employee.secondaryWorkplaces.map((sw) => sw.workplace),
  ]

  useEffect(() => {
    fetch('/api/skills')
      .then((res) => res.json())
      .then((data) => setAllSkills(data))
  }, [])

  const filteredSkills = allSkills.filter((s) => relevantWorkplaces.includes(s.workplace))

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    await fetch(`/api/employees/${employee.id}/skills`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillIds: Array.from(selectedIds) }),
    })
    onSaved()
    onClose()
  }

  // 勤務場所ごとにスキルをグループ化
  const grouped = filteredSkills.reduce<Record<string, Skill[]>>((acc, skill) => {
    if (!acc[skill.workplace]) acc[skill.workplace] = []
    acc[skill.workplace].push(skill)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">
            {employee.lastName} {employee.firstName} のスキル
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {Object.entries(grouped).map(([workplace, skills]) => (
            <div key={workplace}>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                {WORKPLACE_LABELS[workplace]}
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                {skills.map((skill) => {
                  const selected = selectedIds.has(skill.id)
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => toggle(skill.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                        selected
                          ? 'bg-[#0AB4CC]/10 text-[#0AB4CC] border border-[#0AB4CC]/30'
                          : 'bg-gray-50 text-gray-500 border border-gray-100 hover:bg-gray-100'
                      }`}
                    >
                      {selected && <Check className="w-3.5 h-3.5" />}
                      {skill.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {filteredSkills.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              関連するスキルがありません
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-[#0AB4CC] text-white rounded-lg hover:bg-[#099bb0] disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
