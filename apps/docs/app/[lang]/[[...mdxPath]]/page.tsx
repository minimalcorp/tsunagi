import { notFound } from 'next/navigation';
import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { useMDXComponents as getMDXComponents } from '../../../mdx-components.js';
import { LOCALES, type Locale } from '../layout';

export const generateStaticParams = generateStaticParamsFor('mdxPath');

type PageProps = Readonly<{
  params: Promise<{ lang: string; mdxPath?: string[] }>;
}>;

function isValidLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export async function generateMetadata(props: PageProps) {
  const params = await props.params;
  if (!isValidLocale(params.lang)) {
    notFound();
  }
  const { metadata } = await importPage(params.mdxPath, params.lang);
  return metadata;
}

const Wrapper = getMDXComponents().wrapper;

export default async function Page(props: PageProps) {
  const params = await props.params;
  // layout 側でも同じ防御を行っているが、generateMetadata は layout より
  // 先に実行されるパスがあるのでここでも独立にガードする。
  if (!isValidLocale(params.lang)) {
    notFound();
  }
  const result = await importPage(params.mdxPath, params.lang);
  const { default: MDXContent, toc, metadata } = result;
  return (
    <Wrapper toc={toc} metadata={metadata}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
