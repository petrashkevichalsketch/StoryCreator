import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Калькулятор Лема — конструктор сюжета романа",
  description:
    "Интерактивный конструктор сюжета романа методом последовательного выбора развилок: 12 уровней, волны из 5–10 карточек с последствиями, режим Лема и романная библия.",
  icons: {
    icon: "/lem-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-screen flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
