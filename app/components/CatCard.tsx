import InfoTip from '@/app/components/InfoTip';
import PawIcon from '@/app/components/PawIcon';

export const BIO_HELP = 'Who this cat is and what it does all day.';
export const ROAST_HELP = 'What this cat thinks of the neighborhood. Vote if it made you laugh.';

type Props = {
    imageUrl: string;
    alt: string;
    name: React.ReactNode;
    place?: string | null;
    kindTag?: string;
    bio: React.ReactNode;
    roast?: React.ReactNode;
    votes?: React.ReactNode;
    footer?: React.ReactNode;
    // Replaces the default photo (the preview uses this for its "developing" placeholder).
    media?: React.ReactNode;
    as?: 'article' | 'aside';
    headingLevel?: 2 | 3;
    nameId?: string;
    className?: string;
};

// The one flyer used on the feed, Cat of the Day, dashboard and preview. Slots are nodes so
// callers can swap in inputs (editing) or a typed-out bio without this component owning state.
export default function CatCard({
    imageUrl, alt, name, place, kindTag, bio, roast, votes, footer, media,
    as: Tag = 'article', headingLevel = 2, nameId, className,
}: Props) {
    const Heading = `h${headingLevel}` as 'h2' | 'h3';
    return (
        <Tag className={`card${className ? ` ${className}` : ''}`} aria-labelledby={Tag === 'aside' ? nameId : undefined}>
            {media ?? <img src={imageUrl} alt={alt} />}
            <div className="card-body">
                <div className="card-head">
                    <div className="card-title">
                        {kindTag && <span className="kind-tag">{kindTag}</span>}
                        <Heading id={nameId} className="card-name">{name}</Heading>
                        {place && <span className="sticker">{place}</span>}
                    </div>
                    {votes}
                </div>
                <div className="card-bio">
                    <p className="card-label">Bio <InfoTip text={BIO_HELP} label="About the bio" /></p>
                    <div className="card-text">{bio}</div>
                </div>
                {roast ? (
                    <div className="cat-roast">
                        <p className="card-label card-label-roast">
                            <PawIcon size={16} className="cat-roast-paw" fill="var(--red)" stroke="var(--ink)" />
                            The roast <InfoTip text={ROAST_HELP} label="About the roast" />
                        </p>
                        <div className="card-text">{roast}</div>
                    </div>
                ) : null}
                {footer}
            </div>
        </Tag>
    );
}
