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
};

export default withNextra(nextConfig);
