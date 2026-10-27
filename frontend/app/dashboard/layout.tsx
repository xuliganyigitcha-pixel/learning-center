'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { api, clearAuth, getUser, logout, User } from '../lib/api';

const items = [
  { href: '/dashboard', label: 'Umumiy ko‘rinish', icon: '⌂' },
  { href: '/dashboard/students', label: 'O‘quvchilar', icon: '♙' },
  { href: '/dashboard/groups', label: 'Guruhlar', icon: '▦' },
  { href: '/dashboard/lessons', label: 'Darslar va davomat', icon: '▣' },
  { href: '/dashboard/payments', label: 'To‘lovlar', icon: '◉' },
  { href: '/dashboard/users', label: 'Foydalanuvchilar', icon: '♧' },
  { href: '/dashboard/settings', label: 'Sozlamalar', icon: '⚙' },
  { href: '/dashboard/audit', label: 'Amallar tarixi', icon: '≡' },
];

const labels: Record<string, string> = {
  dashboard: 'Umumiy ko‘rinish',
  students: 'O‘quvchilar',
  groups: 'Guruhlar',
  lessons: 'Darslar va davomat',
  payments: 'To‘lovlar',
  users: 'Foydalanuvchilar',
  settings: 'Sozlamalar',
  audit: 'Amallar tarixi',
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    const currentUser = getUser();
    if (!currentUser) router.replace('/login');
    else setUser(currentUser);
  }, [router]);
  useEffect(() => setMobileOpen(false), [pathname]);

  if (!user) return <div className="loading">Hisob tekshirilmoqda…</div>;
  if (user.mustChangePw) {
    async function changePassword(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      setPasswordError('');
      setPasswordSaving(true);
      const form = new FormData(event.currentTarget);
      try {
        await api('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({
            oldPassword: form.get('oldPassword'),
            newPassword: form.get('newPassword'),
          }),
        });
        clearAuth();
        router.replace('/login');
      } catch (reason) {
        setPasswordError(reason instanceof Error ? reason.message : 'Parolni o‘zgartirib bo‘lmadi');
      } finally {
        setPasswordSaving(false);
      }
    }
    return (
      <main className="login-shell">
        <section className="login-panel">
          <form className="login-card" onSubmit={(event) => void changePassword(event)}>
            <h2>Yangi parol o‘rnating</h2>
            <p>Xavfsizlik uchun vaqtinchalik parolni o‘zgartirish talab qilinadi.</p>
            {passwordError && <div className="error-box" role="alert">{passwordError}</div>}
            <div className="field"><label htmlFor="oldPassword">Joriy parol</label><input id="oldPassword" name="oldPassword" type="password" minLength={8} required /></div>
            <div className="field"><label htmlFor="newPassword">Yangi parol</label><input id="newPassword" name="newPassword" type="password" minLength={12} required /></div>
            <button className="btn btn-primary full" disabled={passwordSaving}>{passwordSaving ? 'Saqlanmoqda…' : 'Parolni saqlash'}</button>
          </form>
        </section>
      </main>
    );
  }
  const visibleItems = user.role === 'TEACHER' ? items.filter((item) => !['/dashboard/payments', '/dashboard/users', '/dashboard/settings', '/dashboard/audit'].includes(item.href)) : items;
  const segment = pathname.split('/').filter(Boolean)[1] || 'dashboard';

  return (
    <div className="app-shell">
      <button className={`mobile-overlay ${mobileOpen ? 'show' : ''}`} onClick={() => setMobileOpen(false)} aria-label="Menyuni yopish" />
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <Link className="sidebar-brand" href="/dashboard">
          <div className="brand-mark">O‘</div>
          <div><div className="brand-name">O‘QUV MARKAZI</div><div className="brand-sub">Boshqaruv tizimi</div></div>
        </Link>
        <div className="nav-caption">MENYU</div>
        <nav className="nav-list" aria-label="Asosiy menyu">
          {visibleItems.map((item) => {
            const active = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} className={`nav-link ${active ? 'active' : ''}`}><span className="nav-icon">{item.icon}</span>{item.label}</Link>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-badge">
            <div className="avatar">{user.fullName.slice(0, 1).toUpperCase()}</div>
            <div><div className="user-name">{user.fullName}</div><div className="user-role">{user.role === 'SUPER_ADMIN' ? 'Super administrator' : user.role === 'ADMIN' ? 'Administrator' : 'O‘qituvchi'}</div></div>
          </div>
          <button className="btn" onClick={() => void logout()}>Chiqish <span aria-hidden="true">↗</span></button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setMobileOpen(true)} aria-label="Menyuni ochish">☰</button>
          <div><div className="topbar-kicker">O‘quv markazi</div><div className="topbar-title">{labels[segment] || 'Boshqaruv'}</div></div>
          <div className="topbar-date">{new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'medium' }).format(new Date())}</div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
