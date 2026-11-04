import type { Metadata } from 'next';
import { Bricolage_Grotesque, Nunito_Sans } from 'next/font/google';
import './globals.css';
import Nav from './components/Nav';
import DailyStamp from './components/DailyStamp';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: '800', variable: '--font-display' });
const body = Nunito_Sans({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-body' });

export const metadata: Metadata = {
    title: 'Bodega Cats of NYC',
    description: 'New York’s cats roast your neighborhood. One cat per block, a fresh roast every day, ranked by your votes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${display.variable} ${body.variable}`}>
        <body>
        <Nav />
        <DailyStamp />
        {children}
        </body>
        </html>
    );
}
