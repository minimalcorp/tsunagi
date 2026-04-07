import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import { Banner } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import type { ReactNode } from 'react';

// 対応ロケール。新しい言語を追加する場合はここに追加する。
export const LOCALES = ['en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

// static export 用のロケール一覧を事前生成する
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

// ロケールごとの i18n ラベル (banner, footer 等に使用)
const i18n: Record<Locale, { banner: string; footerPrefix: string }> = {
  en: {
    banner: 'Tsunagi is in active development. Feedback welcome.',
    footerPrefix: 'minimalcorp. Licensed under PolyForm Shield 1.0.0.',
  },
  ja: {
    banner: 'Tsunagi は現在活発に開発中です。フィードバック歓迎。',
    footerPrefix: 'minimalcorp. PolyForm Shield 1.0.0 ライセンス.',
  },
};

type LayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ lang: Locale }>;
}>;

export default async function LangLayout({ children, params }: LayoutProps) {
  const { lang } = await params;
  const labels = i18n[lang] ?? i18n.en;

  const banner = <Banner storageKey="tsunagi-banner-v1">{labels.banner}</Banner>;

  const navbar = (
    <Navbar
      logo={<span style={{ fontWeight: 700 }}>Tsunagi</span>}
      projectLink="https://github.com/minimalcorp/tsunagi"
    />
  );

  const footer = (
    <Footer>
      © {new Date().getFullYear()} {labels.footerPrefix}
    </Footer>
  );

  const pageMap = await getPageMap(`/${lang}`);

  return (
    <Layout
      banner={banner}
      navbar={navbar}
      footer={footer}
      docsRepositoryBase={`https://github.com/minimalcorp/tsunagi/tree/main/apps/docs/content/${lang}`}
      i18n={[
        { locale: 'en', name: 'English' },
        { locale: 'ja', name: '日本語' },
      ]}
      pageMap={pageMap}
    >
      {children}
    </Layout>
  );
}
