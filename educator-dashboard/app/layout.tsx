import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Micro-Adaptive | Educator Dashboard",
  description: "AI-powered micro-adaptive learning platform for educators. Manage courses, track student mastery, and deliver personalized learning experiences.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
