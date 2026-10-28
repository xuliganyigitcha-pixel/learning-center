# O‘quv markazi — boshqaruv tizimi

O‘quv markazlari uchun mobilga mos fullstack ilova: o‘quvchilar, guruhlar, darslar, davomat, to‘lovlar, foydalanuvchilar, sozlamalar va audit tarixi.

## Tez boshlash (Windows)

1. Node.js 24.15 yoki undan yangisini o‘rnating.
2. `start.bat` faylini ishga tushiring. Dastlabki ishga tushirishda backend va frontend paketlari o‘rnatiladi, SQLite bazasi yaratiladi va boshlang‘ich administrator qo‘shiladi.
3. Brauzerda `http://localhost:3000` sahifasini oching.

Boshlang‘ich hisob: `admin` / `Admin123!`. Birinchi kirishda yangi, kamida 12 belgili parol o‘rnatish so‘raladi.

## Qo‘lda ishga tushirish

Loyiha SQLite ishlatadi; Docker yoki alohida ma’lumotlar bazasi serveri talab qilinmaydi.

```powershell
node backend\scripts\init-env.cjs
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

Yangi terminalda:

```powershell
cd frontend
npm ci
npm run dev
```

Backend API `http://localhost:4000/api`, frontend esa `http://localhost:3000` manzilida ishlaydi. `start.bat` `.env` faylini ilk ishga tushirishda yaratib, JWT kalitlarini tasodifiy qiymatlar bilan sozlaydi. Qo‘lda sozlashda ham access va refresh kalitlari alohida, har biri kamida 32 belgili bo‘lishi kerak.

## Modullar

- **Kirish va rollar:** JWT access token, HttpOnly refresh cookie, sessiyalarni yangilash, parol xeshlash va login urinishlarini vaqtincha cheklash.
- **O‘quvchilar:** qidiruv, guruhga biriktirish, oylik to‘lov rejasi va holat.
- **Guruhlar va darslar:** o‘qituvchi, jadval va dars rejalashtirish.
- **Davomat va baholar:** dars bo‘yicha davomatni belgilash va 0–100 oralig‘ida baho kiritish.
- **To‘lovlar:** to‘lovni ro‘yxatga olish, oy va usul bo‘yicha tarix.
- **Foydalanuvchilar:** administrator va o‘qituvchi hisoblari, hisobni faollashtirish/o‘chirish.
- **Sozlamalar va audit:** markaz sozlamalari hamda tizimdagi boshqaruv amallari.
- **Xavfsizlik:** so‘rov validatsiyasi, HTTP security headers, API/login rate limit, refresh token rotation va hisob o‘chirilganda sessiyalarni bekor qilish.

## Rollar

`SUPER_ADMIN` barcha amallarga ega; `ADMIN` kundalik markaz boshqaruvini bajaradi; `TEACHER` o‘z guruhlari doirasida dars va davomat bilan ishlaydi. API har bir so‘rovda token va rolni tekshiradi.

## Texnologiyalar

- Frontend: Next.js 16, React 19, TypeScript
- Backend: NestJS 12, TypeScript
- DB: Prisma ORM + SQLite (`backend/prisma/dev.db`)

SQLite lokal yoki kichik o‘rnatish uchun tanlandi, shu bois dastur Docker o‘rnatmasdan ham ishlaydi. DB fayli va maxfiy sozlamalar versiya nazoratiga qo‘shilmaydi.

## Tekshiruvlar

```powershell
cd backend
npm ci
npm run prisma:generate
npm run build
npm run test:smoke
npm audit

cd ..\frontend
npm ci
npm run build
npm audit
```

GitHub Actions build va audit tekshiruvlarini `main` branch hamda pull requestlarda avtomatik bajaradi.
