import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
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
  title: { default: 'DoorStep Zimbabwe — food, groceries & parcels delivered', template: '%s · DoorStep Zimbabwe' },
  description:
    'Order food, groceries and pharmacy items from local stores, or send a parcel across town. Pay with EcoCash, OneMoney, card or cash, in US dollars or ZiG.',
  appleWebApp: { capable: true, title: 'DoorStep', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#FF7A00',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
