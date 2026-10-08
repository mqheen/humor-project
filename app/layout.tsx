import type { Metadata } from 'next';
import { Bricolage_Grotesque, Nunito_Sans } from 'next/font/google';
import './globals.css';
import Nav from './components/Nav';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: '800', variable: '--font-display' });
const body = Nunito_Sans({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-body' });

export const metadata: Metadata = {
    title: 'Bodega Cats of NYC',
    description: 'Spot a cat in the city, let the AI write its story, and vote for the best ones.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${display.variable} ${body.variable}`}>
        <body>
        <Nav />
        {children}
        </body>
        </html>
    );
}
