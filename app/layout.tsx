import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Nav from './components/Nav';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Nine Lives — Cat Adoption',
  description: 'Cats looking for a home. Browse, sign in, and manage your profile.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
      <html lang="en" className={inter.variable}>
      <body>
      <Nav />
      {children}
      </body>
      </html>
  );
}