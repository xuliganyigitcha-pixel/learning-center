'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, saveAuth, User } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api<{ accessToken: string; user: User }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ login, password }) },
        false,
      );
      saveAuth(result.accessToken, result.user);
      router.replace('/dashboard');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tizimga kirishda xatolik');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-art">
        <div className="sidebar-brand">
          <div className="brand-mark">O‘</div>
          <div>
            <div className="brand-name">O‘QUV MARKAZI</div>
            <div className="brand-sub">Boshqaruv tizimi</div>
          </div>
        </div>
        <div>
          <h1>Ta’limni boshqarish endi osonroq.</h1>
          <p>O‘quvchilar, darslar, davomat va to‘lovlar — barchasi yagona, sodda boshqaruv panelida.</p>
        </div>
        <div className="login-foot">O‘quv markazingiz uchun ishonchli yordamchi</div>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <h2>Xush kelibsiz</h2>
          <p>Davom etish uchun hisobingizga kiring.</p>
          {error && <div className="error-box" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="login">Login</label>
            <input id="login" autoComplete="username" required value={login} onChange={(event) => setLogin(event.target.value)} placeholder="Loginni kiriting" />
          </div>
          <div className="field">
            <label htmlFor="password">Parol</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Parolni kiriting" />
          </div>
          <button className="btn btn-primary full" type="submit" disabled={loading}>
            {loading ? 'Tekshirilmoqda…' : 'Tizimga kirish'}
          </button>
          <div className="login-note">Birinchi marta kiryapsizmi? Dastlabki kirish ma’lumotlari README faylida keltirilgan. Xavfsizlik uchun parolni o‘zgartiring.</div>
        </form>
      </section>
    </main>
  );
}
