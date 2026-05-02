'use client'

import { useState, useEffect } from 'react'
import { X, Check } from 'lucide-react'

type Skill = {
  id: string
  workplace: string
  name: string
}

type Proficiency = 'LOW' | 'MID' | 'HIGH'

type Employee = {
  id: string
  lastName: string
  firstName: string
  primaryWorkplace: string
  secondaryWorkplaces: { workplace: string }[]
  floorProficiency?: Proficiency | null
  skills: { skill: Skill; proficiency?: Proficiency | null }[]
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

const PROFICIENCY_LABELS: Record<Proficiency, string> = {
  LOW: '▲',
  MID: '○',
  HIGH: '◎',
}

const PROFICIENCY_COLORS: Record<Proficiency, string> = {
  LOW: 'bg-amber-100 text-amber-700 border-amber-300',
  MID: 'bg-blue-100 text-blue-700 border-blue-300',
  HIGH: 'bg-emerald-100 text-emerald-700 border-emerald-300',
}

// 習熟度を持つスキルかどうか (現状はカフェのスキル全部)
const hasProficiency = (skill: Skill): boolean => skill.workplace === 'CAFE'

export function EmployeeSkillModal({ employee, onClose, onSaved }: Props) {
  const [allSkills, setAllSkills] = useState<Skill[]>([])
  // skillId → proficiency (null = 選択中だが習熟度なし、undefined = 未選択)
  const [skillProf, setSkillProf] = useState<Map<string, Proficiency | null>>(() => {
    const map = new Map<string, Proficiency | null>()
    for (const es of employee.skills) {
      map.set(es.skill.id, es.proficiency ?? null)
    }
    return map
  })
  const [floorProf, setFloorProf] = useState<Proficiency | null>(employee.floorProficiency ?? null)
  const [saving, setSaving] = useState(false)

  const relevantWorkplaces = [
    employee.primaryWorkplace,
    ...employee.secondaryWorkplaces.map((sw) => sw.workplace),
  ]
  const showFloorProficiency = relevantWorkplaces.includes('FLOOR')

  useEffect(() => {
    fetch('/api/skills')
      .then((res) => res.json())
      .then((data) => setAllSkills(data))
  }, [])

  const filteredSkills = allSkills.filter((s) => relevantWorkplaces.includes(s.workplace))

  const toggleSkill = (skill: Skill) => {
    setSkillProf((prev) => {
      const next = new Map(prev)
      if (next.has(skill.id)) {
        next.delete(skill.id)
      } else {
        // カフェスキルはデフォルト ○(MID)
        next.set(skill.id, hasProficiency(skill) ? 'MID' : null)
      }
      return next
    })
  }

  const setSkillProficiency = (skillId: string, prof: Proficiency) => {
    setSkillProf((prev) => {
      const next = new Map(prev)
      next.set(skillId, prof)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const skills = Array.from(skillProf.entries()).map(([skillId, proficiency]) => ({
      skillId,
      proficiency,
    }))
    await fetch(`/api/employees/${employee.id}/skills`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skills,
        floorProficiency: showFloorProficiency ? floorProf : null,
      }),
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
              <div className="space-y-1.5">
                {skills.map((skill) => {
                  const selected = skillProf.has(skill.id)
                  const prof = skillProf.get(skill.id)
                  const supportsProf = hasProficiency(skill)
                  return (
                    <div key={skill.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSkill(skill)}
                        className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          selected
                            ? 'bg-[#0AB4CC]/10 text-[#0AB4CC] border border-[#0AB4CC]/30'
                            : 'bg-gray-50 text-gray-500 border border-gray-100 hover:bg-gray-100'
                        }`}
                      >
                        {selected && <Check className="w-3.5 h-3.5" />}
                        {skill.name}
                      </button>
                      {selected && supportsProf && (
                        <div className="flex gap-1">
                          {(['LOW', 'MID', 'HIGH'] as Proficiency[]).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setSkillProficiency(skill.id, p)}
                              className={`w-8 h-8 rounded-md text-sm font-bold border transition-colors ${
                                prof === p
                                  ? PROFICIENCY_COLORS[p]
                                  : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
                              }`}
                              title={`${PROFICIENCY_LABELS[p]} (${p === 'LOW' ? '低' : p === 'MID' ? '中' : '高'})`}
                            >
                              {PROFICIENCY_LABELS[p]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {showFloorProficiency && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                フロア習熟度
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFloorProf(null)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    floorProf === null
                      ? 'bg-gray-100 text-gray-700 border-gray-300'
                      : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  未設定
                </button>
                {(['LOW', 'MID', 'HIGH'] as Proficiency[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setFloorProf(p)}
                    className={`w-12 h-10 rounded-lg text-base font-bold border transition-colors ${
                      floorProf === p
                        ? PROFICIENCY_COLORS[p]
                        : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'
                    }`}
                    title={p === 'LOW' ? '低' : p === 'MID' ? '中' : '高'}
                  >
                    {PROFICIENCY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredSkills.length === 0 && !showFloorProficiency && (
            <p className="text-sm text-gray-400 text-center py-4">
              関連するスキルがありません
            </p>
          )}

          <p className="text-xs text-gray-400">
            ▲=低 / ○=中 / ◎=高 — シフト生成時の制約 (▲がいる日は◎が必要 等) に使われます。
          </p>
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
