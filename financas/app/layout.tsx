import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finanças da Casa",
  description: "Gestão financeira e quitação de dívidas — David & Paola",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
