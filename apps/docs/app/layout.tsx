import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import { Banner, Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
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

const banner = (
  <Banner storageKey="tsunagi-banner-v1">
    Tsunagi is in active development. Feedback welcome.
  </Banner>
);

const navbar = (
  <Navbar
    logo={<span style={{ fontWeight: 700 }}>Tsunagi</span>}
    projectLink="https://github.com/minimalcorp/tsunagi"
  />
);

const footer = (
  <Footer>© {new Date().getFullYear()} minimalcorp. Licensed under PolyForm Shield 1.0.0.</Footer>
);

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          banner={banner}
          navbar={navbar}
          footer={footer}
          docsRepositoryBase="https://github.com/minimalcorp/tsunagi/tree/main/apps/docs"
          pageMap={await getPageMap()}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
