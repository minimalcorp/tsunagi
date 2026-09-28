import Script from 'next/script';

// GA4 測定ID（公開値）。クライアント遷移の page_view は GA4 拡張計測の
// 「ブラウザの履歴イベントに基づくページ変更」で送信される。
const GA_MEASUREMENT_ID = 'G-L24T1KPC65';

// dev サーバーのアクセスを計測しないよう、本番ビルド時のみ読み込む。
export function GoogleAnalytics() {
  if (process.env.NODE_ENV !== 'production') return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
      </Script>
    </>
  );
}
