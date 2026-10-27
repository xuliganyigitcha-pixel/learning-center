import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "O'quv Markazi — boshqaruv tizimi",
  description: "O‘quv markazingiz uchun boshqaruv paneli",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}
