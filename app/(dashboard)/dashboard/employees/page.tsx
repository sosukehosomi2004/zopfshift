'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Search, Factory, Coffee, Store, Briefcase, MoreHorizontal, ChevronUp, ChevronDown, ChevronsUpDown, ShieldCheck } from 'lucide-react'
import { EmployeeFormModal } from '@/components/employee/EmployeeFormModal'
import { EmployeeSkillModal } from '@/components/employee/EmployeeSkillModal'
import { EmployeeRulesModal } from '@/components/employee/EmployeeRulesModal'
import { EmployeeDeleteModal } from '@/components/employee/EmployeeDeleteModal'
import { EmployeePasswordResetModal } from '@/components/employee/EmployeePasswordResetModal'
import { EmployeeCreatedModal } from '@/components/employee/EmployeeCreatedModal'

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
  role: string
  employmentType: string
  primaryWorkplace: string
  isActive: boolean
  retiredAt: string | null
  floorProficiency: 'LOW' | 'MID' | 'HIGH' | null
  secondaryWorkplaces: { workplace: string }[]
  availableShiftTimes: { timeSlot: string }[]
  skills: { skill: Skill; proficiency: 'LOW' | 'MID' | 'HIGH' | null }[]
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

const WORKPLACE_ORDER: Record<string, number> = {
  FACTORY: 0, CAFE: 1, FLOOR: 2, OFFICE: 3, OTHER: 4,
}
const EMPLOYMENT_ORDER: Record<string, number> = {
  FULL_TIME: 0, PART_TIME: 1,
}

type SortKey = 'employeeNumber' | 'name' | 'workplace' | 'employmentType' | 'skillCount' | 'secondary'
type SortDir = 'asc' | 'desc'

export default function EmployeesPage() {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [skillTarget, setSkillTarget] = useState<Employee | null>(null)
  const [rulesTarget, setRulesTarget] = useState<Employee | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<Employee | null>(null)
  const [createdInfo, setCreatedInfo] = useState<{ employeeNumber: number; lastName: string; firstName: string; initialPassword: string } | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('employeeNumber')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const fetchEmployees = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/employees')
      if (res.redirected || !res.ok) {
        // セッション切れでログイン画面にリダイレクトされた場合
        if (res.url.includes('/login')) {
          window.location.href = '/login'
          return
        }
        setEmployees([])
        return
      }
      const data = await res.json()
      setEmployees(Array.isArray(data) ? data : [])
    } catch {
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmployees()
  }, [])

  const filtered = useMemo(() => {
    const base = employees.filter((emp) => {
      if (activeTab !== 'ALL' && emp.primaryWorkplace !== activeTab) return false
      if (search) {
        const q = search.toLowerCase()
        const name = `${emp.lastName}${emp.firstName}`.toLowerCase()
        const romaji = `${emp.lastNameRomaji}${emp.firstNameRomaji}`.toLowerCase()
        return name.includes(q) || romaji.includes(q) || String(emp.employeeNumber).includes(q)
      }
      return true
    })

    const compare = (a: Employee, b: Employee): number => {
      switch (sortKey) {
        case 'employeeNumber':
          return a.employeeNumber - b.employeeNumber
        case 'name': {
          const an = `${a.lastNameRomaji}${a.firstNameRomaji}`.toLowerCase()
          const bn = `${b.lastNameRomaji}${b.firstNameRomaji}`.toLowerCase()
          return an.localeCompare(bn)
        }
        case 'workplace':
          return (WORKPLACE_ORDER[a.primaryWorkplace] ?? 99) - (WORKPLACE_ORDER[b.primaryWorkplace] ?? 99)
        case 'employmentType':
          return (EMPLOYMENT_ORDER[a.employmentType] ?? 99) - (EMPLOYMENT_ORDER[b.employmentType] ?? 99)
        case 'skillCount':
          return a.skills.length - b.skills.length
        case 'secondary':
          return a.secondaryWorkplaces.length - b.secondaryWorkplaces.length
        default:
          return 0
      }
    }

    return [...base].sort((a, b) => {
      const v = compare(a, b)
      // 同値なら社員番号で安定ソート
      if (v === 0) return a.employeeNumber - b.employeeNumber
      return sortDir === 'asc' ? v : -v
    })
  }, [employees, activeTab, search, sortKey, sortDir])

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ChevronsUpDown className="w-3 h-3 text-gray-300" />
    return sortDir === 'asc' ? (
      <ChevronUp className="w-3 h-3 text-[#0AB4CC]" />
    ) : (
      <ChevronDown className="w-3 h-3 text-[#0AB4CC]" />
    )
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
          placeholder="名前・社員番号で検索..."
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
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  <button onClick={() => handleSort('employeeNumber')} className="flex items-center gap-1 hover:text-gray-900">
                    No. <SortIcon column="employeeNumber" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-900">
                    名前 <SortIcon column="name" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  <button onClick={() => handleSort('workplace')} className="flex items-center gap-1 hover:text-gray-900">
                    勤務場所 <SortIcon column="workplace" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  <button onClick={() => handleSort('employmentType')} className="flex items-center gap-1 hover:text-gray-900">
                    雇用形態 <SortIcon column="employmentType" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">権限</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  <button onClick={() => handleSort('skillCount')} className="flex items-center gap-1 hover:text-gray-900">
                    スキル数 <SortIcon column="skillCount" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  <button onClick={() => handleSort('secondary')} className="flex items-center gap-1 hover:text-gray-900">
                    移動可能 <SortIcon column="secondary" />
                  </button>
                </th>
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
                      <div className="font-medium text-gray-900 inline-flex items-center gap-2 flex-wrap">
                        {emp.lastName} {emp.firstName}
                        {emp.retiredAt && (() => {
                          const retired = new Date(emp.retiredAt.split('T')[0] + 'T23:59:59')
                          const isPast = retired.getTime() < Date.now()
                          return (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              isPast ? 'bg-gray-200 text-gray-600' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {isPast ? '退職済' : '退職予定'} {emp.retiredAt.split('T')[0]}
                            </span>
                          )
                        })()}
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
                    <td className="px-4 py-3">
                      {emp.role === 'ADMIN' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          <ShieldCheck className="w-3 h-3" />
                          管理者
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">スタッフ</span>
                      )}
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
                          onClick={() => setRulesTarget(emp)}
                          className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                        >
                          ルール
                        </button>
                        <button
                          onClick={() => { setEditTarget(emp); setShowForm(true) }}
                          className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => setDeleteTarget(emp)}
                          className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600"
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
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
          currentUserId={currentUserId}
          onClose={() => { setShowForm(false); setEditTarget(null) }}
          onSaved={fetchEmployees}
          onResetPassword={editTarget ? () => {
            const target = editTarget
            setShowForm(false)
            setEditTarget(null)
            setPasswordTarget(target)
          } : undefined}
          onCreated={(initialPassword, emp) => {
            setCreatedInfo({ ...emp, initialPassword })
          }}
        />
      )}

      {/* 登録完了 (初期パスワード表示) モーダル */}
      {createdInfo && (
        <EmployeeCreatedModal
          employeeNumber={createdInfo.employeeNumber}
          lastName={createdInfo.lastName}
          firstName={createdInfo.firstName}
          initialPassword={createdInfo.initialPassword}
          onClose={() => setCreatedInfo(null)}
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

      {/* ルール編集モーダル */}
      {rulesTarget && (
        <EmployeeRulesModal
          employee={rulesTarget}
          onClose={() => setRulesTarget(null)}
        />
      )}

      {/* 削除確認モーダル */}
      {deleteTarget && (
        <EmployeeDeleteModal
          employee={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={fetchEmployees}
        />
      )}

      {/* パスワードリセットモーダル */}
      {passwordTarget && (
        <EmployeePasswordResetModal
          employee={passwordTarget}
          onClose={() => setPasswordTarget(null)}
        />
      )}
    </div>
  )
}
