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
  title: { default: 'DoorStep Zimbabwe — food, shopping & parcels delivered', template: '%s · DoorStep Zimbabwe' },
  description:
    'Order food, groceries, medicine, electronics, clothing and more from local shops, or send a parcel across town. Pay with EcoCash, OneMoney, card or cash, in US dollars or ZiG.',
  authors: [{ name: 'Hamza Protech Solutions' }],
  creator: 'Hamza Protech Solutions',
  appleWebApp: { capable: true, title: 'DoorStep', statusBarStyle: 'default' },
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
        <Splash />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
