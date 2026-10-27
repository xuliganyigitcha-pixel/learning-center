# O‘quv markazi — boshqaruv tizimi

O‘quv markazlari uchun mobilga mos fullstack ilova: o‘quvchilar, guruhlar, darslar, davomat, to‘lovlar, foydalanuvchilar, sozlamalar va audit tarixi.

## Tez boshlash (Windows)

1. Node.js 20 yoki undan yangisini o‘rnating.
2. `start.bat` faylini ishga tushiring. Dastlabki ishga tushirishda backend va frontend paketlari o‘rnatiladi, SQLite bazasi yaratiladi va boshlang‘ich administrator qo‘shiladi.
3. Brauzerda `http://localhost:3000` sahifasini oching.

Boshlang‘ich hisob: `superadmin` / `Admin123!`. Birinchi kirishda yangi parol o‘rnatish so‘raladi.

## Qo‘lda ishga tushirish

Loyiha SQLite ishlatadi; Docker yoki alohida ma’lumotlar bazasi serveri talab qilinmaydi.

```powershell
Copy-Item backend\.env.example backend\.env
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

Yangi terminalda:

```powershell
cd frontend
npm install
npm run dev
```

Backend API `http://localhost:4000/api`, frontend esa `http://localhost:3000` manzilida ishlaydi. `backend\.env` ichidagi JWT kalitlarini internetga ochiq yoki production muhitida ishlatishdan oldin o‘zgartiring.

## Modullar

- **Kirish va rollar:** JWT access token, HttpOnly refresh cookie, sessiyalarni yangilash, parol xeshlash va login urinishlarini vaqtincha cheklash.
- **O‘quvchilar:** qidiruv, guruhga biriktirish, oylik to‘lov rejasi va holat.
- **Guruhlar va darslar:** o‘qituvchi, jadval va dars rejalashtirish.
- **Davomat va baholar:** dars bo‘yicha davomatni belgilash va 0–100 oralig‘ida baho kiritish.
- **To‘lovlar:** to‘lovni ro‘yxatga olish, oy va usul bo‘yicha tarix.
- **Foydalanuvchilar:** administrator va o‘qituvchi hisoblari, hisobni faollashtirish/o‘chirish.
- **Sozlamalar va audit:** markaz sozlamalari hamda tizimdagi boshqaruv amallari.

## Rollar

`SUPER_ADMIN` barcha amallarga ega; `ADMIN` kundalik markaz boshqaruvini bajaradi; `TEACHER` o‘z guruhlari doirasida dars va davomat bilan ishlaydi. API har bir so‘rovda token va rolni tekshiradi.

## Texnologiyalar

- Frontend: Next.js 16, React 19, TypeScript
- Backend: NestJS 12, TypeScript
- DB: Prisma ORM + SQLite (`backend/prisma/dev.db`)

SQLite lokal yoki kichik o‘rnatish uchun tanlandi, shu bois dastur Docker o‘rnatmasdan ham ishlaydi. DB fayli va maxfiy sozlamalar versiya nazoratiga qo‘shilmaydi.
