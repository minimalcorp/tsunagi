// `/` にアクセスされた場合、ブラウザの言語設定に応じてロケール別のトップページに
// リダイレクトする。static export 環境ではサーバーサイドで Accept-Language を読めないため、
// クライアントサイド JS で navigator.languages を見て振り分ける。
//
// 優先順位:
//   1. localStorage の `tsunagi-docs-locale` (ユーザーが明示的に選択した言語)
//   2. navigator.languages のプライマリサブタグが対応ロケールにマッチしたもの
//   3. デフォルトロケール (en) にフォールバック
//
// JS 無効環境向けフォールバックとして meta refresh で `/en/` に飛ばす。

const LOCALES = ['en', 'ja'] as const;
const DEFAULT_LOCALE = 'en';
const STORAGE_KEY = 'tsunagi-docs-locale';

export default function RootPage() {
  const script = `(function () {
  var locales = ${JSON.stringify(LOCALES)};
  var defaultLocale = ${JSON.stringify(DEFAULT_LOCALE)};
  var storageKey = ${JSON.stringify(STORAGE_KEY)};
  var basePath = location.pathname.replace(/\\/?$/, '');

  function go(locale) {
    window.location.replace(basePath + '/' + locale + '/');
  }

  try {
    var stored = localStorage.getItem(storageKey);
    if (stored && locales.indexOf(stored) !== -1) {
      go(stored);
      return;
    }
  } catch (e) {}

  var preferred = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || ''];
  for (var i = 0; i < preferred.length; i++) {
    var primary = String(preferred[i]).toLowerCase().split('-')[0];
    if (locales.indexOf(primary) !== -1) {
      go(primary);
      return;
    }
  }
  go(defaultLocale);
})();`;

  return (
    <>
      {/* JS 無効環境向けフォールバック。JS が動けば script の方が先に実行される */}
      <meta httpEquiv="refresh" content="0; url=./en/" />
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <p style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
        Redirecting… / リダイレクトしています…
      </p>
    </>
  );
}
