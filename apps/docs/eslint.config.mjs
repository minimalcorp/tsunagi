import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  {
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  prettier,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'dist/**']),
]);

export default eslintConfig;
