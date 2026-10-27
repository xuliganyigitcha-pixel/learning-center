'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Stats = { students: number; activeStudents: number; groups: number; todayLessons: number; monthPayments: number };
type Student = { id: string; studentCode: string; firstName: string; lastName: string; group?: { name: string } | null; status: string };

const money = (amount: number) => new Intl.NumberFormat('uz-UZ').format(amount) + ' so‘m';

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api<Stats>('/dashboard/stats'), api<Student[]>('/students')])
      .then(([dashboard, list]) => { setStats(dashboard); setStudents(list.slice(0, 5)); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Ma’lumotlarni yuklab bo‘lmadi'));
  }, []);

  const cards = [
    { title: 'Jami o‘quvchilar', value: stats?.students ?? '—', foot: `${stats?.activeStudents ?? '—'} faol o‘quvchi`, icon: '♙' },
    { title: 'Faol guruhlar', value: stats?.groups ?? '—', foot: 'Barcha faol guruhlar', icon: '▦' },
    { title: 'Bugungi darslar', value: stats?.todayLessons ?? '—', foot: 'Rejadagi mashg‘ulotlar', icon: '▣' },
    { title: 'Shu oy tushumlari', value: stats ? money(stats.monthPayments) : '—', foot: 'Joriy oyda qabul qilingan', icon: '◉' },
  ];

  return (
    <>
      <div className="page-heading"><div><h1>Umumiy ko‘rinish</h1><p>Markazingizdagi asosiy ko‘rsatkichlar va so‘nggi o‘quvchilar.</p></div></div>
      {error && <div className="error-box">{error}</div>}
      <section className="stat-grid">
        {cards.map((card) => <article className="stat-card" key={card.title}><div className="stat-top"><span>{card.title}</span><span className="stat-icon">{card.icon}</span></div><div className="stat-value">{card.value}</div><div className="stat-foot">{card.foot}</div></article>)}
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><div className="panel-title">Yaqinda qo‘shilgan o‘quvchilar</div><Link className="btn btn-secondary" href="/dashboard/students">Barchasi →</Link></div>
          <div className="table-wrap">
            <table><thead><tr><th>O‘quvchi</th><th>Guruh</th><th>Holati</th></tr></thead>
              <tbody>{students.map((student) => <tr key={student.id}><td><div className="student-name">{student.lastName} {student.firstName}</div><div className="student-code">ID {student.studentCode}</div></td><td>{student.group?.name || 'Guruh belgilanmagan'}</td><td><span className={`pill ${student.status === 'ACTIVE' ? 'active' : ''}`}>{student.status === 'ACTIVE' ? 'Faol' : student.status}</span></td></tr>)}
                {!students.length && <tr><td colSpan={3}><div className="empty-state">{error ? 'Ma’lumotlar mavjud emas' : 'Hali o‘quvchilar qo‘shilmagan'}</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><div className="panel-title">Tezkor amallar</div></div>
          <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
            <Link className="btn btn-secondary" href="/dashboard/students">＋ O‘quvchi qo‘shish</Link>
            <Link className="btn btn-secondary" href="/dashboard/groups">▦ Guruhlarni boshqarish</Link>
            <Link className="btn btn-secondary" href="/dashboard/lessons">▣ Dars va davomat</Link>
            <Link className="btn btn-secondary" href="/dashboard/payments">◉ To‘lovlarni ko‘rish</Link>
          </div>
        </section>
      </div>
    </>
  );
}
