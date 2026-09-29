import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Compiled output of `tsc -p tsconfig.dist.json`. Not source code.
    'dist/**',
    // Prisma client output. Auto-generated.
    'generated/**',
    // Vendored runtime assets copied by scripts/copy-vad-assets.mjs.
    'public/vad/**',
  ]),
]);

export default eslintConfig;
