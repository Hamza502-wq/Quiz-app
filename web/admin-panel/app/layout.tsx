import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Splash, splashScript } from '@doorstep/web-shared/splash';
import { Providers } from './providers';
import './globals.css';

const poppins = localFont({
  src: [
    { path: './fonts/Poppins-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/Poppins-Medium.ttf', weight: '500', style: 'normal' },
    { path: './fonts/Poppins-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: './fonts/Poppins-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'DoorStep Admin', template: '%s · DoorStep Admin' },
  description: 'DoorStep Zimbabwe operations console.',
  robots: { index: false, follow: false },
  creator: 'Hamza Protech Solutions',
  appleWebApp: { capable: true, title: 'DS Admin', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#FF7A00',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The splash script marks <html> before React loads (data-splash), hence suppressHydrationWarning.
    <html lang="en" className={poppins.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: splashScript }} />
      </head>
      <body>
        <Splash appName="Admin" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
