import PawIcon from '@/app/components/PawIcon';

// The loyalty card's 10 circles, one paw per day of the streak, "+N" past 10.
// `stampNewest` marks the latest punch so DailyStamp can animate it in.
export default function LoyaltyPunches({ streak, stampNewest = false }: { streak: number; stampNewest?: boolean }) {
    const newest = stampNewest ? streak - 1 : -1;
    return (
        <ol className="loyalty-punches" aria-label={`${Math.min(streak, 10)} of 10 days punched`}>
            {Array.from({ length: 10 }, (_, i) => (
                <li key={i} className={`punch${i < streak ? ' punched' : ''}${i === newest ? ' punch-new' : ''}`}>
                    {i < streak && <PawIcon size={22} fill="var(--red)" stroke="var(--ink)" />}
                </li>
            ))}
            {streak > 10 && <li className={`punch-more${newest >= 10 ? ' punch-new' : ''}`}>+{streak - 10}</li>}
        </ol>
    );
}
