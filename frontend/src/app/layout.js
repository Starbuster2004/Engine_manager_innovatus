import './globals.css';
import { AuthProvider } from '@/lib/AuthContext';

export const viewport = {
  themeColor: '#3b82f6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata = {
  title: 'EngineTrace — Smart Warehouse Management',
  description: 'Real-time engine traceability and warehouse management system for automotive manufacturing plants. QR-based tracking, VIN verification, and analytics.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'EngineTrace',
  },
  icons: {
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="EngineTrace" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}

function ServiceWorkerRegistration() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          if ('serviceWorker' in navigator) {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
              navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for (let registration of registrations) {
                  registration.unregister().then(function() {
                    console.log('SW unregistered on localhost');
                  });
                }
              });
            } else {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js')
                  .then(function(reg) { console.log('SW registered:', reg.scope); })
                  .catch(function(err) { console.log('SW registration failed:', err); });
              });
            }
          }
        `,
      }}
    />
  );
}
