import type { Metadata, Viewport } from 'next'
import { Toaster } from 'react-hot-toast'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'shiPRO — Fleet Management & Logistics',
  description: 'Professional fleet management and logistics operations platform for companies managing trucking deliveries.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'shiPRO Fleet Management',
    description: 'Manage your fleet, job orders, and logistics operations.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#1a1a1a',
              color: '#f0f0f0',
              border: '0.5px solid #2a2a2a',
              borderRadius: '10px',
              fontSize: '14px',
              fontFamily: "'DM Sans', sans-serif",
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#0d2117' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#1c0808' } },
          }}
        />
      </body>
    </html>
  )
}
