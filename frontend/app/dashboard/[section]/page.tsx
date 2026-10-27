'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, getUser, User } from '../../lib/api';

type Student = { id: string; studentCode: string; firstName: string; lastName: string; phone?: string | null; status: string; group?: { id: string; name: string } | null };
type Group = { id: string; name: string; scheduleText?: string | null; teacher?: { fullName: string } | null; _count?: { students: number }; isActive: boolean };
type Lesson = { id: string; date: string; topic?: string | null; isCancelled: boolean; group: { name: string } };
type Payment = { id: string; amount: number; paidAt: string; periodMonth: string; method: string; student: { firstName: string; lastName: string; studentCode: string } };
type StudentWithPlan = Student & { paymentPlan?: { monthlyFee: number } | null };
type Person = { id: string; login: string; fullName: string; phone?: string | null; role: string; isActive: boolean };
type AttendanceLine = { student: Student; status: string };
type GradeLine = { studentId: string; score: number; comment?: string | null };
type DataRow = Record<string, unknown>;

const labels: Record<string, { title: string; description: string }> = {
  students: { title: 'O‘quvchilar', description: 'O‘quvchilar ro‘yxati, guruhlari va aloqa ma’lumotlari.' },
  groups: { title: 'Guruhlar', description: 'Guruhlar, o‘qituvchilar va haftalik dars jadvalini boshqaring.' },
  lessons: { title: 'Darslar va davomat', description: 'Darslarni rejalashtiring, davomatni va baholarni kiriting.' },
  payments: { title: 'To‘lovlar', description: 'O‘quvchilar to‘lovlari va tushumlar tarixini yuriting.' },
  users: { title: 'Foydalanuvchilar', description: 'Administrator va o‘qituvchilar hisoblarini boshqaring.' },
  settings: { title: 'Sozlamalar', description: 'Markaz nomi va o‘quv jarayoni sozlamalari.' },
  audit: { title: 'Amallar tarixi', description: 'Tizimdagi oxirgi boshqaruv amallari.' },
};

const money = (amount: number) => new Intl.NumberFormat('uz-UZ').format(amount) + ' so‘m';
const formatDate = (value: string) => new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function SectionPage({ params }: { params: { section: string } }) {
  const section = params.section;
  const meta = labels[section];
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState('');
  const [lessonPanel, setLessonPanel] = useState<'attendance' | 'grades' | null>(null);
  const [attendance, setAttendance] = useState<AttendanceLine[]>([]);
  const [grades, setGrades] = useState<GradeLine[]>([]);
  const [settingValues, setSettingValues] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (section === 'students') setStudents(await api<Student[]>(`/students?search=${encodeURIComponent(search)}`));
      if (section === 'groups') {
        const groupData = await api<Group[]>('/groups');
        setGroups(groupData);
        if (getUser()?.role !== 'TEACHER') setPeople(await api<Person[]>('/users'));
      }
      if (section === 'lessons') {
        const [lessonData, groupData] = await Promise.all([api<Lesson[]>('/lessons'), api<Group[]>('/groups')]);
        setLessons(lessonData);
        setGroups(groupData);
      }
      if (section === 'payments') {
        const [paymentData, studentData] = await Promise.all([api<Payment[]>('/payments'), api<Student[]>('/students')]);
        setPayments(paymentData);
        setStudents(studentData);
      }
      if (section === 'users') setPeople(await api<Person[]>('/users'));
      if (section === 'settings') {
        const result = await api<{ key: string; value: string }[]>('/settings');
        setRows(result);
        setSettingValues(Object.fromEntries(result.map((item) => [item.key, item.value])));
      }
      if (section === 'audit') setRows(await api<DataRow[]>('/audit'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ma’lumotlarni yuklab bo‘lmadi');
    } finally {
      setLoading(false);
    }
  }, [section, search]);

  useEffect(() => { setUser(getUser()); }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSuccess(''); }, [section]);

  const canManage = Boolean(user && user.role !== 'TEACHER');
  const lessonGroups = useMemo(() => groups, [groups]);

  async function submit(event: FormEvent<HTMLFormElement>, path: string, payload: unknown) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api(path, { method: 'POST', body: JSON.stringify(payload) });
      setFormOpen(false);
      setSuccess('Ma’lumot saqlandi.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Saqlashda xatolik');
    }
  }

  async function saveAttendance() {
    setError('');
    try {
      await api(`/attendance/${selectedLesson}`, { method: 'POST', body: JSON.stringify({ records: attendance.map((item) => ({ studentId: item.student.id, status: item.status })) }) });
      setSuccess('Davomat saqlandi.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Davomatni saqlab bo‘lmadi');
    }
  }

  async function loadAttendance(lessonId: string) {
    setSelectedLesson(lessonId);
    setLessonPanel('attendance');
    setError('');
    try {
      setAttendance(await api<AttendanceLine[]>(`/attendance/${lessonId}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Davomatni yuklab bo‘lmadi');
    }
  }

  async function loadGrades(lessonId: string) {
    setSelectedLesson(lessonId);
    setLessonPanel('grades');
    setError('');
    try {
      const [studentsForLesson, existing] = await Promise.all([
        api<AttendanceLine[]>(`/attendance/${lessonId}`),
        api<GradeLine[]>(`/grades/lesson/${lessonId}`),
      ]);
      const current = new Map(existing.map((grade) => [grade.studentId, grade]));
      setGrades(studentsForLesson.map(({ student }) => ({
        studentId: student.id,
        score: current.get(student.id)?.score ?? 0,
        comment: current.get(student.id)?.comment || '',
      })));
      setAttendance(studentsForLesson);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Baholarni yuklab bo‘lmadi');
    }
  }

  async function saveGrades() {
    setError('');
    try {
      await api(`/grades/${selectedLesson}`, {
        method: 'POST',
        body: JSON.stringify({ records: grades.map((grade) => grade) }),
      });
      setSuccess('Baholar saqlandi.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Baholarni saqlab bo‘lmadi');
    }
  }

  async function toggleActive(person: Person) {
    try {
      await api(`/users/${person.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !person.isActive }) });
      await load();
      setSuccess('Foydalanuvchi holati yangilandi.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Yangilashda xatolik');
    }
  }

  if (!meta) return <div className="panel"><div className="empty-state">Sahifa topilmadi.</div></div>;
  const canWrite = canManage;

  return (
    <>
      <div className="page-heading">
        <div><h1>{meta.title}</h1><p>{meta.description}</p></div>
        {canWrite && ['students', 'groups', 'lessons', 'payments', 'users'].includes(section) && <button className="btn btn-primary" onClick={() => setFormOpen((value) => !value)}>{formOpen ? 'Bekor qilish' : '+ Yangi qo‘shish'}</button>}
      </div>
      {error && <div className="error-box" role="alert">{error}</div>}
      {success && <div className="success-box" role="status">{success}</div>}
      {formOpen && section === 'students' && <form className="inline-form" onSubmit={(event) => {
        const form = new FormData(event.currentTarget);
        void submit(event, '/students', {
          firstName: form.get('firstName'), lastName: form.get('lastName'), phone: form.get('phone') || undefined,
          groupId: form.get('groupId') || undefined, monthlyFee: form.get('monthlyFee') ? Number(form.get('monthlyFee')) : undefined,
        });
      }}>
        <Field label="Ism" name="firstName" required /><Field label="Familiya" name="lastName" required /><Field label="Telefon" name="phone" />
        <div className="field"><label>Guruh</label><select name="groupId" defaultValue=""><option value="">Guruh tanlang</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div>
        <Field label="Oylik to‘lov (so‘m)" name="monthlyFee" type="number" />
        <button className="btn btn-primary">O‘quvchini saqlash</button>
      </form>}
      {formOpen && section === 'groups' && <form className="inline-form" onSubmit={(event) => {
        const form = new FormData(event.currentTarget);
        void submit(event, '/groups', { name: form.get('name'), teacherId: form.get('teacherId') || undefined, scheduleText: form.get('scheduleText') || undefined });
      }}>
        <Field label="Guruh nomi" name="name" required />
        <div className="field"><label>O‘qituvchi</label><select name="teacherId" defaultValue=""><option value="">O‘qituvchi tanlang</option>{people.filter((item) => item.role === 'TEACHER').map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></div>
        <Field label="Dars jadvali" name="scheduleText" placeholder="Du / Ch / Ju · 18:00" />
        <button className="btn btn-primary">Guruh yaratish</button>
      </form>}
      {formOpen && section === 'lessons' && <form className="inline-form" onSubmit={(event) => {
        const form = new FormData(event.currentTarget);
        void submit(event, '/lessons', { groupId: form.get('groupId'), date: new Date(String(form.get('date'))).toISOString(), topic: form.get('topic') || undefined });
      }}>
        <div className="field"><label>Guruh</label><select name="groupId" required defaultValue=""><option value="">Guruh tanlang</option>{lessonGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div>
        <Field label="Sana va vaqt" name="date" type="datetime-local" required /><Field label="Mavzu" name="topic" />
        <button className="btn btn-primary">Dars yaratish</button>
      </form>}
      {formOpen && section === 'payments' && <form className="inline-form" onSubmit={(event) => {
        const form = new FormData(event.currentTarget);
        void submit(event, '/payments', { studentId: form.get('studentId'), amount: Number(form.get('amount')), periodMonth: form.get('periodMonth'), method: form.get('method'), comment: form.get('comment') || undefined });
      }}>
        <div className="field"><label>O‘quvchi</label><select name="studentId" required defaultValue=""><option value="">O‘quvchi tanlang</option>{students.map((student) => <option key={student.id} value={student.id}>{student.lastName} {student.firstName} · {student.studentCode}</option>)}</select></div>
        <Field label="Summa (so‘m)" name="amount" type="number" required /><Field label="Oy (YYYY-MM)" name="periodMonth" type="month" required />
        <div className="field"><label>To‘lov usuli</label><select name="method"><option value="CASH">Naqd</option><option value="CARD">Karta</option><option value="CLICK">Click</option><option value="PAYME">Payme</option></select></div>
        <button className="btn btn-primary">To‘lovni saqlash</button>
      </form>}
      {formOpen && section === 'users' && <form className="inline-form" onSubmit={(event) => {
        const form = new FormData(event.currentTarget);
        void submit(event, '/users', { fullName: form.get('fullName'), login: form.get('login'), role: form.get('role'), password: form.get('password'), phone: form.get('phone') || undefined });
      }}>
        <Field label="Ism familiya" name="fullName" required /><Field label="Login" name="login" required /><Field label="Vaqtinchalik parol (kamida 12 belgi)" name="password" type="password" required />
        <div className="field"><label>Rol</label><select name="role"><option value="TEACHER">O‘qituvchi</option><option value="ADMIN">Administrator</option></select></div>
        <button className="btn btn-primary">Hisob yaratish</button>
      </form>}

      {section === 'students' && <section className="panel">
        <div className="panel-header"><div className="panel-title">O‘quvchilar ro‘yxati <span className="pill">{students.length}</span></div><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ism, telefon yoki ID bo‘yicha qidirish" /></div>
        {loading ? <div className="loading">Yuklanmoqda…</div> : <div className="table-wrap"><table><thead><tr><th>O‘quvchi</th><th>Telefon</th><th>Guruh</th><th>Oylik to‘lov</th><th>Holati</th></tr></thead><tbody>
          {students.map((student) => <tr key={student.id}><td><div className="student-name">{student.lastName} {student.firstName}</div><div className="student-code">ID {student.studentCode}</div></td><td>{student.phone || '—'}</td><td>{student.group?.name || 'Belgilanmagan'}</td><td>{(student as StudentWithPlan).paymentPlan ? money((student as StudentWithPlan).paymentPlan!.monthlyFee) : '—'}</td><td><span className={`pill ${student.status === 'ACTIVE' ? 'active' : ''}`}>{student.status === 'ACTIVE' ? 'Faol' : student.status}</span></td></tr>)}
          {!students.length && <tr><td colSpan={5}><div className="empty-state">Qidiruv bo‘yicha ma’lumot topilmadi.</div></td></tr>}
        </tbody></table></div>}
      </section>}
      {section === 'groups' && <section className="group-grid">{loading ? <div className="loading">Yuklanmoqda…</div> : groups.map((group) => <article className="panel group-card" key={group.id}><div className="group-mark">{group.name.slice(0, 1).toUpperCase()}</div><h3>{group.name}</h3><p>O‘qituvchi: {group.teacher?.fullName || 'Biriktirilmagan'}</p><p>Jadval: {group.scheduleText || 'Belgilanmagan'}</p><div className="group-meta"><span>♙ {group._count?.students ?? 0} o‘quvchi</span><span>{group.isActive ? 'Faol' : 'Faol emas'}</span></div></article>)}{!groups.length && !loading && <div className="panel empty-state">Guruhlar hali yaratilmagan.</div>}</section>}
      {section === 'lessons' && <section className="panel">
        <div className="panel-header"><div className="panel-title">Darslar <span className="pill">{lessons.length}</span></div></div>
        {loading ? <div className="loading">Yuklanmoqda…</div> : <div className="table-wrap"><table><thead><tr><th>Sana</th><th>Guruh</th><th>Mavzu</th><th>Davomat</th><th>Holati</th></tr></thead><tbody>
          {lessons.map((lesson) => <tr key={lesson.id}><td>{formatDate(lesson.date)}</td><td>{lesson.group.name}</td><td>{lesson.topic || '—'}</td><td><div className="lesson-controls"><button className="btn btn-secondary" onClick={() => void loadAttendance(lesson.id)}>Davomat</button><button className="btn btn-secondary" onClick={() => void loadGrades(lesson.id)}>Baholar</button></div></td><td><span className={`pill ${lesson.isCancelled ? 'warning' : 'active'}`}>{lesson.isCancelled ? 'Bekor qilingan' : 'Rejada'}</span></td></tr>)}
          {!lessons.length && <tr><td colSpan={5}><div className="empty-state">Darslar hali rejalashtirilmagan.</div></td></tr>}
        </tbody></table></div>}
        {selectedLesson && lessonPanel === 'attendance' && <div className="panel-body">
          <div className="panel-header" style={{ padding: '0 0 14px' }}><div className="panel-title">Davomat</div><button className="btn btn-primary" onClick={() => void saveAttendance()}>Davomatni saqlash</button></div>
          <div className="table-wrap"><table><thead><tr><th>O‘quvchi</th><th>Holat</th></tr></thead><tbody>{attendance.map((item) => <tr key={item.student.id}><td>{item.student.lastName} {item.student.firstName}</td><td><select className="mini-select" value={item.status} onChange={(event) => setAttendance((current) => current.map((entry) => entry.student.id === item.student.id ? { ...entry, status: event.target.value } : entry))}><option value="PRESENT">Keldi</option><option value="LATE">Kechikdi</option><option value="ABSENT_EXCUSED">Sababli kelmadi</option><option value="ABSENT_UNEXCUSED">Sababsiz kelmadi</option></select></td></tr>)}</tbody></table></div>
        </div>}
        {selectedLesson && lessonPanel === 'grades' && <div className="panel-body">
          <div className="panel-header" style={{ padding: '0 0 14px' }}><div className="panel-title">Dars baholari</div><button className="btn btn-primary" onClick={() => void saveGrades()}>Baholarni saqlash</button></div>
          <div className="table-wrap"><table><thead><tr><th>O‘quvchi</th><th>Baho (0–100)</th><th>Izoh</th></tr></thead><tbody>{attendance.map(({ student }) => {
            const grade = grades.find((item) => item.studentId === student.id);
            return <tr key={student.id}><td>{student.lastName} {student.firstName}</td><td><input className="mini-select" type="number" min="0" max="100" value={grade?.score ?? 0} onChange={(event) => setGrades((current) => current.map((item) => item.studentId === student.id ? { ...item, score: Number(event.target.value) } : item))} /></td><td><input className="mini-select" value={grade?.comment || ''} onChange={(event) => setGrades((current) => current.map((item) => item.studentId === student.id ? { ...item, comment: event.target.value } : item))} placeholder="Izoh" /></td></tr>;
          })}</tbody></table></div>
        </div>}
      </section>}
      {section === 'payments' && <section className="panel">
        <div className="panel-header"><div className="panel-title">To‘lovlar tarixi <span className="pill">{payments.length}</span></div></div>
        {loading ? <div className="loading">Yuklanmoqda…</div> : <div className="table-wrap"><table><thead><tr><th>O‘quvchi</th><th>Summa</th><th>Oy</th><th>Usul</th><th>Sana</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td><div className="student-name">{payment.student.lastName} {payment.student.firstName}</div><div className="student-code">{payment.student.studentCode}</div></td><td>{money(payment.amount)}</td><td>{payment.periodMonth}</td><td>{payment.method}</td><td>{formatDate(payment.paidAt)}</td></tr>)}{!payments.length && <tr><td colSpan={5}><div className="empty-state">To‘lovlar mavjud emas.</div></td></tr>}</tbody></table></div>}
      </section>}
      {section === 'users' && <section className="panel">
        <div className="panel-header"><div className="panel-title">Tizim foydalanuvchilari <span className="pill">{people.length}</span></div></div>
        {loading ? <div className="loading">Yuklanmoqda…</div> : <div className="table-wrap"><table><thead><tr><th>Foydalanuvchi</th><th>Login</th><th>Rol</th><th>Holati</th><th></th></tr></thead><tbody>{people.map((person) => <tr key={person.id}><td className="student-name">{person.fullName}</td><td>{person.login}</td><td>{person.role}</td><td><span className={`pill ${person.isActive ? 'active' : 'warning'}`}>{person.isActive ? 'Faol' : 'Nofaol'}</span></td><td><button className="btn btn-secondary" onClick={() => void toggleActive(person)}>{person.isActive ? 'O‘chirish' : 'Faollashtirish'}</button></td></tr>)}</tbody></table></div>}
      </section>}
      {section === 'settings' && <section className="panel"><div className="panel-header"><div className="panel-title">Tizim sozlamalari</div></div><div className="panel-body">
        <div className="notice">Sozlamalarni tahrirlash uchun super administrator huquqi kerak. Kalitlar tizimdagi hisob-kitob va markaz ko‘rinishiga ta’sir qilishi mumkin.</div>
        <div className="settings-list">{rows.map((row) => {
          const key = String(row.key);
          const canSave = user?.role === 'SUPER_ADMIN';
          return <div className="setting-row" key={key}><div><div className="setting-key">{key.replaceAll('_', ' ')}</div><div className="setting-value">Tizim sozlamasi</div></div><input className="search-input" value={settingValues[key] || ''} disabled={!canSave} onChange={(event) => setSettingValues((current) => ({ ...current, [key]: event.target.value }))} /><button className="btn btn-secondary" disabled={!canSave} onClick={async () => { try { await api('/settings', { method: 'POST', body: JSON.stringify({ key, value: settingValues[key] || '' }) }); setSuccess('Sozlama saqlandi.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Saqlashda xatolik'); } }}>Saqlash</button></div>;
        })}</div>
      </div></section>}
      {section === 'audit' && <section className="panel"><div className="panel-header"><div className="panel-title">So‘nggi amallar</div></div>{loading ? <div className="loading">Yuklanmoqda…</div> : <div className="table-wrap"><table><thead><tr><th>Vaqt</th><th>Foydalanuvchi</th><th>Amal</th><th>Bo‘lim</th><th>Ma’lumot</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)}><td>{formatDate(String(row.createdAt))}</td><td>{String((row.user as { fullName?: string } | null)?.fullName || '—')}</td><td><span className="pill">{String(row.action)}</span></td><td>{String(row.entityType)}</td><td>{String(row.entityId || '—')}</td></tr>)}{!rows.length && <tr><td colSpan={5}><div className="empty-state">Hozircha qaydlar yo‘q.</div></td></tr>}</tbody></table></div>}</section>}
    </>
  );
}

function Field({ label, name, type = 'text', required = false, placeholder }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string }) {
  return <div className="field"><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} required={required} placeholder={placeholder} min={type === 'number' ? '0' : undefined} /></div>;
}
