'use client';

import Link from 'next/link';
import InfoTip from '@/app/components/InfoTip';
import StreakIcon from '@/app/components/StreakIcon';
import { STREAK_LADDER, streakTitle } from '@/app/lib/nyc';

// "Day N · Title" in the nav. The tooltip opens on hover and on keyboard focus (the link is the focus target)
// and lists the whole ladder with the current rung marked.
export default function StreakPill({ streak }: { streak: number }) {
    const title = streakTitle(streak);
    return (
        <InfoTip
            align="end"
            text={(
                <>
                    <span className="ladder-intro">Visit daily to keep your streak.</span>
                    <span className="ladder">
                        {STREAK_LADDER.map((rung) => (
                            <span key={rung.title} className={`ladder-row${rung.title === title ? ' current' : ''}`}>
                                <StreakIcon title={rung.title} size={18} />
                                <span className="ladder-name">{rung.title}</span>
                                <span className="ladder-days">{rung.at === 0 ? 'Day 1' : `${rung.at} days`}</span>
                            </span>
                        ))}
                    </span>
                </>
            )}
        >
            {(a11y) => (
                <Link href="/dashboard" className="nav-streak" {...a11y}>
                    <StreakIcon title={title} size={20} className="streak-icon" />
                    <span className="streak-full" aria-hidden="true">Day {streak} · {title}</span>
                    <span className="streak-short" aria-hidden="true">{streak}</span>
                    <span className="sr-only">Day {streak}, {title}</span>
                </Link>
            )}
        </InfoTip>
    );
}
