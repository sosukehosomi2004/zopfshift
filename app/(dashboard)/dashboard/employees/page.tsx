'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Search, Factory, Coffee, Store, Briefcase, MoreHorizontal, ChevronUp, ChevronDown, ChevronsUpDown, ShieldCheck } from 'lucide-react'
import { EmployeeFormModal } from '@/components/employee/EmployeeFormModal'
import { EmployeeSkillModal } from '@/components/employee/EmployeeSkillModal'
import { PageHelp } from '@/components/help/PageHelp'
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
  employeeNumber: string
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
  L: 'L',
  OFFICE: '事務',
  OTHER: 'その他',
}

const WORKPLACE_ICONS: Record<string, React.ElementType> = {
  FACTORY: Factory,
  CAFE: Coffee,
  FLOOR: Store,
  L: Store,
  OFFICE: Briefcase,
  OTHER: MoreHorizontal,
}

// シフト表 (ShiftGrid) と同じ色対応。アイコン/バッジ用の薄い背景
const WORKPLACE_BG: Record<string, string> = {
  FACTORY: 'bg-[#0AB4CC]/15 text-[#0AB4CC]',
  CAFE: 'bg-yellow-200 text-yellow-800',
  FLOOR: 'bg-green-200 text-green-800',
  L: 'bg-red-200 text-red-800',
  OFFICE: 'bg-purple-100 text-purple-800',
  OTHER: 'bg-stone-200 text-stone-700',
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
  const [createdInfo, setCreatedInfo] = useState<{ employeeNumber: string; lastName: string; firstName: string; initialPassword: string } | null>(null)
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
        return name.includes(q) || romaji.includes(q) || emp.employeeNumber.toLowerCase().includes(q)
      }
      return true
    })

    const compare = (a: Employee, b: Employee): number => {
      switch (sortKey) {
        case 'employeeNumber':
          return a.employeeNumber.localeCompare(b.employeeNumber)
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
      if (v === 0) return a.employeeNumber.localeCompare(b.employeeNumber)
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
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">従業員管理</h1>
          <PageHelp title="従業員管理 - ヘルプ">
            <h3>このページでできること</h3>
            <ul>
              <li>従業員の登録・編集・退職処理</li>
              <li>各従業員のスキル設定 (工場の窯/仕込/カフェのK/Sなど)</li>
              <li>各従業員の<strong>個人ルール</strong> (毎週○曜日は休み等の通年設定)</li>
              <li>主な勤務地・移動可能勤務地の設定</li>
              <li>管理者権限の付与・解除</li>
              <li>パスワードリセット</li>
            </ul>
            <h3>基本操作</h3>
            <ol>
              <li>右上「<strong>従業員を追加</strong>」で新規登録 (初期パスワードは password123)</li>
              <li>行をクリックで詳細編集</li>
              <li>「<strong>スキル</strong>」ボタンで習熟度 (◎/〇/▲) を設定</li>
              <li>「<strong>ルール</strong>」ボタンで個人ルール (通年設定) を編集</li>
              <li>退職する場合は <strong>退職日</strong>を入力 (退職日翌日以降は休み確定)</li>
            </ol>

            <h3>📅 個人ルール (通年の固定スケジュール)</h3>
            <p>「毎週木曜は休み」「祝日は工場勤務」のように、ある条件を満たす日に<strong>休み or 出勤を自動で固定</strong>するルールです。シフト生成時に自動で展開され、その日付は<strong>事前確定セル</strong>として扱われます。</p>

            <h4>設定できる条件タイプ</h4>
            <ul>
              <li><strong>曜日指定</strong>: 毎週○曜日 (例: 毎週木曜)。「祝日除く」のオプション付き</li>
              <li><strong>日カテゴリ</strong>:
                <ul>
                  <li>祝日</li>
                  <li>休日 (土日+祝日)</li>
                  <li>平日 (月-金, 祝日除く)</li>
                </ul>
              </li>
            </ul>

            <h4>アクションタイプ</h4>
            <ul>
              <li><strong>常に休み (ALWAYS_OFF)</strong>: 該当日は必ず休みになる</li>
              <li><strong>常に出勤 (ALWAYS_WORK)</strong>: 該当日は指定勤務場所で必ず出勤</li>
            </ul>

            <h4>使用例</h4>
            <ul>
              <li>毎週木曜は休み (祝日除く) → 木曜が祝日のときだけ出勤</li>
              <li>平日 (月-金) は工場 → 平日は必ず工場勤務</li>
              <li>祝日は休み → すべての祝日に固定休み</li>
            </ul>

            <h4>注意点</h4>
            <ul>
              <li>ルールは<strong>シフト期間作成時</strong>に自動で事前確定セルへ展開される</li>
              <li>既に作られた期間の事前確定セルは、ルールを変えても自動更新されない (期間を再作成すれば反映)</li>
              <li>休み申請が承認された場合、ルールより<strong>申請優先</strong>になる</li>
              <li>事前確定セルを管理者が手動で取り消すと、その日はルール対象外になる</li>
            </ul>

            <h3>スキルと習熟度</h3>
            <ul>
              <li><strong>カフェ</strong>: ▲(LOW) のスタッフがいる日は ◎(HIGH) のスタッフも必須</li>
              <li><strong>フロア</strong>: ▲(LOW) のスタッフは1日最大2名まで</li>
              <li><strong>工場</strong>: 各ポジション (窯・仕込・前麺等) に対応スキルが必要</li>
            </ul>
            <h3>注意点</h3>
            <ul>
              <li>従業員を削除はできず、論理削除 (isActive=false) になる</li>
              <li>パスワードリセットすると次回ログイン時に強制変更画面が出る</li>
              <li>自分自身の管理者権限は外せない (ロックアウト防止)</li>
            </ul>
          </PageHelp>
        </div>
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
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${WORKPLACE_BG[emp.primaryWorkplace] ?? 'bg-gray-100 text-gray-700'}`}>
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
                            <span key={sw.workplace} className={`text-xs px-1.5 py-0.5 rounded font-medium ${WORKPLACE_BG[sw.workplace] ?? 'bg-gray-100 text-gray-600'}`}>
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
