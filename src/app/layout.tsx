import type { Metadata } from 'next';
import { Geist, Geist_Mono, Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { ToastProvider } from '@/components/ToastProvider';
import { EditorSessionProvider } from '@/components/EditorSessionProvider';
import { cn } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Tsunagi (繋ぎ)',
  description: 'AI時代の統合開発マネージャー - Claude と人間のシームレスな協働開発を実現',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn('font-sans', inter.variable)}>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          {children}
          <ConnectionStatus />
          <ToastProvider />
          <EditorSessionProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
