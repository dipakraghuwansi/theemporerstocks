import type { Metadata } from "next";
import "./globals.css";
import Navigation from '@/components/Navigation';
import StockStreamBootstrap from '@/components/StockStreamBootstrap';

export const metadata: Metadata = {
  title: "The Emperor Stocks",
  description: "Stocks-first trading workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <StockStreamBootstrap />
        <Navigation />
        {children}
      </body>
    </html>
  );
}
