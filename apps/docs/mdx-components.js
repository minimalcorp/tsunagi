import { useMDXComponents as getThemeComponents } from 'nextra-theme-docs';

const themeComponents = getThemeComponents();

// Next.js の basePath は MDX 中の JSX `<img>` に自動適用されないため、
// MDX から `<Screenshot src="/..." />` を呼び出せるようにし、
// NEXT_PUBLIC_BASE_PATH を前置した img を出力するコンポーネントを
// useMDXComponents に登録する。
// MDX 3 では capital JSX タグがスコープになければ `_components.X` を
// ルックアップするため、import 不要で各 MDX ファイルから利用できる。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function Screenshot({ src, alt }) {
  const resolved =
    typeof src === 'string' && src.startsWith('/') && !src.startsWith('//')
      ? `${basePath}${src}`
      : src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={resolved} alt={alt} style={{ maxWidth: '100%', maxHeight: '80vh' }} />
  );
}

export function useMDXComponents(components) {
  return {
    ...themeComponents,
    Screenshot,
    ...components,
  };
}
