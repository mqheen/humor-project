// One small inline icon per streak title. Shapes are drawn on a 24px grid with the same ink outline
// and butter fill as the paws, so they sit in the pill like the rest of the flyer art.
const SHAPES: Record<string, React.ReactNode> = {
    'New in town': ( // suitcase
        <>
            <path d="M9 7.5V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5" fill="none" />
            <rect x="3.5" y="7.5" width="17" height="12.5" rx="2" />
            <path d="M9 7.5v12.5M15 7.5v12.5" fill="none" />
        </>
    ),
    'Regular': ( // coffee cup
        <>
            <path d="M5 9.5h11v5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14.5z" />
            <path d="M16 11h1.2a2.4 2.4 0 0 1 0 4.8H15.6" fill="none" />
            <path d="M8.2 3.5q-1 1.6 0 3.2M12.2 3.5q-1 1.6 0 3.2" fill="none" />
        </>
    ),
    'Local': ( // key
        <>
            <circle cx="7.5" cy="12" r="4" />
            <circle cx="7.5" cy="12" r="1.2" fill="var(--paper)" />
            <path d="M11.5 12H21M17.5 12v3.2M20.8 12v2.2" fill="none" />
        </>
    ),
    'Block captain': ( // megaphone
        <>
            <path d="M4 9.5v5h3l8 4V5.5l-8 4z" />
            <path d="M7 14.5l1.2 5h2.3l-1-4.2" fill="none" />
            <path d="M18.2 9.2q1.8 2.8 0 5.6" fill="none" />
        </>
    ),
    'Mayor': ( // crown
        <>
            <path d="M3.5 18.5L4.8 8l4.4 4L12 5.8 14.8 12l4.4-4 1.3 10.5z" />
            <path d="M3.5 21h17" fill="none" />
        </>
    ),
};

export default function StreakIcon({ title, size = 18, className }: { title: string; size?: number; className?: string }) {
    return (
        <svg
            className={className}
            width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
            fill="var(--butter)" stroke="var(--ink)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
        >
            {SHAPES[title] ?? SHAPES['New in town']}
        </svg>
    );
}
