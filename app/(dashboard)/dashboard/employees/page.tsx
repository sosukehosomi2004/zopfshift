'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, Factory, Coffee, Store, Briefcase, MoreHorizontal } from 'lucide-react'
import { EmployeeFormModal } from '@/components/employee/EmployeeFormModal'
import { EmployeeSkillModal } from '@/components/employee/EmployeeSkillModal'

type Skill = {
  id: string
  workplace: string
  name: string
}

type Employee = {
  id: string
  employeeNumber: number
  lastName: string
  firstName: string
  lastNameRomaji: string
  firstNameRomaji: string
  email: string
  role: string
  employmentType: string
  primaryWorkplace: string
  isActive: boolean
  secondaryWorkplaces: { workplace: string }[]
  availableShiftTimes: { timeSlot: string }[]
  skills: { skill: Skill }[]
}

const WORKPLACE_LABELS: Record<string, string> = {
  FACTORY: '工場',
  CAFE: 'カフェ',
  FLOOR: 'フロア',
  OFFICE: '事務',
  OTHER: 'その他',
}

const WORKPLACE_ICONS: Record<string, React.ElementType> = {
  FACTORY: Factory,
  CAFE: Coffee,
  FLOOR: Store,
  OFFICE: Briefcase,
  OTHER: MoreHorizontal,
}

const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME: '正社員',
  PART_TIME: 'パート',
}

const WORKPLACE_TABS = ['ALL', 'FACTORY', 'CAFE', 'FLOOR', 'OFFICE', 'OTHER'] as const

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [skillTarget, setSkillTarget] = useState<Employee | null>(null)

  const fetchEmployees = async () => {
    setLoading(true)
    const res = await fetch('/api/employees')
    const data = await res.json()
    setEmployees(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchEmployees()
  }, [])

  const filtered = employees.filter((emp) => {
    if (activeTab !== 'ALL' && emp.primaryWorkplace !== activeTab) return false
    if (search) {
      const q = search.toLowerCase()
      const name = `${emp.lastName}${emp.firstName}`.toLowerCase()
      const romaji = `${emp.lastNameRomaji}${emp.firstNameRomaji}`.toLowerCase()
      return name.includes(q) || romaji.includes(q) || emp.email.includes(q)
    }
    return true
  })

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${name}さんを無効化しますか？`)) return
    await fetch(`/api/employees/${id}`, { method: 'DELETE' })
    fetchEmployees()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">従業員管理</h1>
        <button
          onClick={() => { setEditTarget(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-[#0AB4CC] text-white px-4 py-2 rounded-lg hover:bg-[#099bb0] transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          従業員を追加
        </button>
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {WORKPLACE_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'ALL' ? '全員' : WORKPLACE_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* 検索 */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="名前・メールで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20 focus:border-[#0AB4CC]"
        />
      </div>

      {/* テーブル */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">No.</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">名前</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">勤務場所</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">雇用形態</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">スキル数</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">移動可能</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => {
                const Icon = WORKPLACE_ICONS[emp.primaryWorkplace] || MoreHorizontal
                return (
                  <tr key={emp.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-400">{emp.employeeNumber}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {emp.lastName} {emp.firstName}
                      </div>
                      <div className="text-xs text-gray-400">
                        {emp.lastNameRomaji} {emp.firstNameRomaji}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-gray-700">
                        <Icon className="w-3.5 h-3.5" />
                        {WORKPLACE_LABELS[emp.primaryWorkplace]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        emp.employmentType === 'FULL_TIME'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-orange-50 text-orange-700'
                      }`}>
                        {EMPLOYMENT_LABELS[emp.employmentType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{emp.skills.length}</td>
                    <td className="px-4 py-3">
                      {emp.secondaryWorkplaces.length > 0 ? (
                        <div className="flex gap-1">
                          {emp.secondaryWorkplaces.map((sw) => (
                            <span key={sw.workplace} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {WORKPLACE_LABELS[sw.workplace]}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => setSkillTarget(emp)}
                          className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                        >
                          スキル
                        </button>
                        <button
                          onClick={() => { setEditTarget(emp); setShowForm(true) }}
                          className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDelete(emp.id, `${emp.lastName}${emp.firstName}`)}
                          className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600"
                        >
                          無効化
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    該当する従業員がいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 従業員登録/編集モーダル */}
      {showForm && (
        <EmployeeFormModal
          employee={editTarget}
          onClose={() => { setShowForm(false); setEditTarget(null) }}
          onSaved={fetchEmployees}
        />
      )}

      {/* スキル編集モーダル */}
      {skillTarget && (
        <EmployeeSkillModal
          employee={skillTarget}
          onClose={() => setSkillTarget(null)}
          onSaved={fetchEmployees}
        />
      )}
    </div>
  )
}
