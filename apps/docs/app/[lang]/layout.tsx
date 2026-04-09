import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import { Banner } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import type { ReactNode } from 'react';
import logoIcon from '../icon.png';

// 対応ロケール。新しい言語を追加する場合はここに追加する。
export const LOCALES = ['en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

function isValidLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

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
  params: Promise<{ lang: string }>;
}>;

export default async function LangLayout({ children, params }: LayoutProps) {
  const { lang } = await params;
  // Unknown ロケール (/favicon.ico や /robots.txt 等のブラウザ自動リクエスト、
  // bot アクセス) を catchall に吸い込ませない。Nextra の getPageMap は
  // 未知の lang キーを dispatch できず TypeError を投げるため、事前に
  // notFound() で 404 を返す。
  if (!isValidLocale(lang)) {
    notFound();
  }
  const labels = i18n[lang];

  const banner = <Banner storageKey="tsunagi-banner-v1">{labels.banner}</Banner>;

  const navbar = (
    <Navbar
      logo={<Image src={logoIcon} alt="Tsunagi" width={32} height={32} />}
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
