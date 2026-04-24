import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';

import { cn } from '@/lib/utils';

import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Vermont Events',
  description: 'A community events calendar for Vermont',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={cn('font-sans', geist.variable)}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
