import { Head } from 'nextra/components';
import 'nextra-theme-docs/style.css';
import type { ReactNode } from 'react';

export const metadata = {
  metadataBase: new URL('https://minimalcorp.github.io/tsunagi/'),
  title: {
    default: 'Tsunagi Docs',
    template: '%s | Tsunagi',
  },
  description: 'Tsunagi — multi-repo GitHub project management with Claude AI integration.',
};

// Next.js App Router の要請により、app 配下に最低1つの root layout
// が必要。このレイアウトは <html> と <body> を返し、実際の theme
// レンダリングは app/[lang]/layout.tsx に委譲する。
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>{children}</body>
    </html>
  );
}
