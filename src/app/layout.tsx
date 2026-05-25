import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pomotree",
  description: "A local-first pomodoro app with task trees.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
