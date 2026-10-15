import PawIcon from '@/app/components/PawIcon';

export default function CatTip({ tip, className }: { tip: string; className?: string }) {
    return (
        <p className={`cat-tip${className ? ` ${className}` : ''}`}>
            <PawIcon size={16} className="cat-tip-paw" fill="var(--red)" stroke="var(--ink)" />
            <span><span className="cat-tip-label">Cat’s tip:</span> {tip}</span>
        </p>
    );
}
