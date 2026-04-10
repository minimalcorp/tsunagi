import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([prettier, globalIgnores(['dist/**', 'scripts/**'])]);

export default eslintConfig;
