export const NEIGHBORHOODS = [
    'Morningside Heights', 'Harlem', 'Upper West Side', 'Upper East Side', "Hell's Kitchen",
    'Chelsea', 'West Village', 'East Village', 'Lower East Side', 'Chinatown',
    'Williamsburg', 'Bushwick', 'Greenpoint', 'Park Slope', 'Astoria',
    'Long Island City', 'Jackson Heights', 'Flushing', 'The Bronx', 'Staten Island',
] as const;

// Checked local anchors the AI can lean on, so bios and roasts name real streets, trains, parks and foods
// instead of inventing them. Keep entries to things that are stable and widely known.
export const NEIGHBORHOOD_FACTS: Record<(typeof NEIGHBORHOODS)[number], string> = {
    'Morningside Heights': '1 train at 110th St and 116th St–Columbia University; Riverside Park along the Hudson; Morningside Park; the Cathedral of St. John the Divine on Amsterdam Ave; Columbia’s Low Library steps; late-night diners on Broadway.',
    'Harlem': '2/3 trains on Lenox Ave and A/B/C/D at 125th St; the Apollo Theater on 125th St; Marcus Garvey Park; Strivers’ Row on W 138th–139th St; soul food; Senegalese food on W 116th St.',
    'Upper West Side': '1/2/3 trains under Broadway and B/C along Central Park West; Riverside Park; the west side of Central Park; the American Museum of Natural History at 79th St; bagels and smoked fish on Broadway.',
    'Upper East Side': 'Q train at 72nd, 86th and 96th St on Second Ave and 4/5/6 on Lexington Ave; Museum Mile on Fifth Ave including the Met at 82nd St; Carl Schurz Park on East End Ave; the east side of Central Park.',
    "Hell's Kitchen": 'A/C/E at 42nd St and C/E at 50th St; Ninth Avenue packed with Thai and other cheap eats; Restaurant Row on W 46th St; next to the Theater District; Hudson River Park piers.',
    'Chelsea': 'The High Line; Chelsea Market on Ninth Ave at 15th St; art galleries on W 20s between 10th and 11th Ave; C/E at 23rd St, 1 train on Seventh Ave, L at 14th St; Hudson River Park.',
    'West Village': 'Bleecker St and Christopher St; 1 train at Christopher St and the A/C/E/B/D/F/M at W 4th St; Washington Square Park next door; Hudson River Park piers; pizza by the slice on Carmine and Bleecker St.',
    'East Village': 'Tompkins Square Park; St. Marks Place; L at First Ave and 6 at Astor Place; community gardens around Avenues B and C; Ukrainian food on Second Ave; ramen and dumplings.',
    'Lower East Side': 'F/J/M/Z at Delancey St–Essex St; Orchard St and the Tenement Museum; Essex Market; Seward Park; pickles, bialys and Jewish deli tradition; the Williamsburg Bridge walkway.',
    'Chinatown': 'Mott St and Canal St; Columbus Park; J/Z/N/Q/R/W/6 at Canal St and B/D at Grand St; Sara D. Roosevelt Park; dim sum (go early on weekends), dumplings and hand-pulled noodles.',
    'Williamsburg': 'L at Bedford Ave and J/M/Z at Marcy Ave; Domino Park and McCarren Park; the Williamsburg Bridge walkway; NYC Ferry on the East River; Manhattan skyline views from the waterfront.',
    'Bushwick': 'L at Jefferson St and Morgan Ave and J/M/Z above Broadway; big street murals around Troutman St; Maria Hernandez Park; Latin American bakeries and taco spots.',
    'Greenpoint': 'G train at Nassau Ave and Greenpoint Ave (the only subway line through it); Manhattan Ave; McGolrick Park; WNYC Transmitter Park on the waterfront; Polish bakeries and kielbasa.',
    'Park Slope': 'Prospect Park; Seventh Ave and Fifth Ave; F/G at Seventh Ave and 2/3 at Grand Army Plaza; the Saturday Greenmarket at Grand Army Plaza; brownstone blocks.',
    'Astoria': 'N/W trains elevated over 31st St to Astoria–Ditmars Blvd; Astoria Park under the RFK (Triborough) and Hell Gate bridges; Greek tavernas and bakeries on 30th Ave and Ditmars Blvd; Middle Eastern food on Steinway St; Museum of the Moving Image.',
    'Long Island City': '7 train at Vernon Blvd–Jackson Ave and E/M at Court Sq; Gantry Plaza State Park and its Manhattan skyline view; MoMA PS1; NYC Ferry at Hunters Point South.',
    'Jackson Heights': '7 train elevated over Roosevelt Ave and E/F/M/R at 74th St–Broadway; Himalayan momos and Indian sweets around 74th St; Colombian and other Latin American food along Roosevelt Ave; the 34th Ave open street; Travers Park.',
    'Flushing': 'The 7 train ends at Flushing–Main St; Main St and its basement food courts; hand-pulled noodles, soup dumplings and other regional Chinese food; Flushing Meadows Corona Park and the Unisphere; Queens Botanical Garden.',
    'The Bronx': 'Arthur Avenue’s Italian food in Belmont; the Bronx Zoo and New York Botanical Garden; Yankee Stadium at 161st St (4/B/D); the Grand Concourse; Pelham Bay Park and Orchard Beach.',
    'Staten Island': 'The free Staten Island Ferry between Whitehall in Manhattan and St. George, with Statue of Liberty views; the Staten Island Railway; Snug Harbor; the Greenbelt trails; Verrazzano-Narrows Bridge views from Fort Wadsworth.',
};

export const VIBES = [
    'Bodega regular', 'Subway commuter', 'Rooftop cat', 'Fire escape philosopher', 'Laundromat manager', 'Pizza slice critic',
] as const;

// Max lengths for a cat's editable text (the roast lives in the generations.tip column).
export const TEXT_LIMITS = { cat_name: 40, bio: 160, tip: 200 } as const;

export const isNeighborhood = (v: unknown): v is string => typeof v === 'string' && (NEIGHBORHOODS as readonly string[]).includes(v);
export const isVibe = (v: unknown): v is string => typeof v === 'string' && (VIBES as readonly string[]).includes(v);

const TITLES = [
    { at: 30, title: 'Mayor' },
    { at: 14, title: 'Block captain' },
    { at: 7, title: 'Local' },
    { at: 3, title: 'Regular' },
    { at: 0, title: 'New in town' },
];

export const streakTitle = (streak: number) => TITLES.find((t) => streak >= t.at)!.title;

// Lowest title first, for the ladder in the streak tooltip.
export const STREAK_LADDER = [...TITLES].reverse();

// The next title up and how many days it takes, or null at Mayor.
export function nextMilestone(streak: number) {
    const next = [...TITLES].reverse().find((t) => t.at > streak);
    return next ? { title: next.title, days: next.at - streak } : null;
}

// touch_streak() counts days in New York time, so we do too.
export const nyDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);

// The stored streak only counts if the user was active today or yesterday; otherwise it has lapsed.
export function liveStreak(streak: number | null | undefined, lastActive: string | null | undefined) {
    if (!streak || !lastActive) return 0;
    const now = new Date();
    const today = nyDate(now);
    const yesterday = nyDate(new Date(now.getTime() - 86_400_000));
    return lastActive === today || lastActive === yesterday ? streak : 0;
}
