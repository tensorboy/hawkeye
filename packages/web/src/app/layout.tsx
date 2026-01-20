import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Hawkeye - Intelligent Task Assistant',
  description: 'Your AI-powered task perception and execution assistant. Local-first, privacy-focused.',
  keywords: ['AI assistant', 'task automation', 'productivity', 'Claude AI'],
  authors: [{ name: 'tensorboy' }],
  metadataBase: new URL('https://hawkiyi.com'),
  openGraph: {
    title: 'Hawkeye - Intelligent Task Assistant',
    description: 'Your AI-powered task perception and execution assistant',
    type: 'website',
    url: 'https://hawkiyi.com',
    siteName: 'Hawkeye',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hawkeye - Intelligent Task Assistant',
    description: 'Your AI-powered task perception and execution assistant',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#667eea',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
