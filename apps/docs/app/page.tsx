// `/` にアクセスされた場合、デフォルトロケール (英語) にリダイレクトする。
// static export 環境ではランタイム redirect() が効かないため、
// HTML meta refresh + クライアント側 JS fallback で対応する。
//
// GitHub Pages で basePath がある場合に備えて、相対パス形式のリンクを
// 使う (basePath は Next.js が自動で付与する)。

export default function RootPage() {
  return (
    <>
      <meta httpEquiv="refresh" content="0; url=./en/" />
      <script
        dangerouslySetInnerHTML={{
          __html:
            "window.location.replace(window.location.pathname.replace(/\\/?$/, '') + '/en/');",
        }}
      />
      <p style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
        Redirecting to <a href="./en/">English documentation</a>
        ...
      </p>
    </>
  );
}
