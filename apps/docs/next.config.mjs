import nextra from 'nextra';

const withNextra = nextra({
  // Default Nextra 4 configuration. Search, syntax highlight, and MDX
  // components are enabled out of the box.
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export for GitHub Pages deployment.
  output: 'export',
  // GitHub Pages serves from a subpath when hosted at
  // https://<user>.github.io/<repo>/ — set NEXT_PUBLIC_BASE_PATH in CI for
  // project pages, leave unset for user/organization root sites.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  images: {
    // Next.js image optimization is unavailable on GitHub Pages.
    unoptimized: true,
  },
  // Trailing slashes simplify directory-style routing on static hosts.
  trailingSlash: true,
  // i18n locales: Nextra 4 reads this field to populate NEXTRA_LOCALES env var
  // (App Router 自体は next.config.i18n を使わないが、Nextra の内部処理が
  // この値を読んで content/<locale>/ 配下のページを解決する)。
  i18n: {
    locales: ['en', 'ja'],
    defaultLocale: 'en',
  },
};

export default withNextra(nextConfig);
