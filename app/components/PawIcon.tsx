export default function PawIcon({ size, className, fill, stroke }: { size: number; className?: string; fill?: string; stroke?: string }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={fill} stroke={stroke} strokeWidth={stroke ? 1.4 : undefined}>
            <ellipse cx="12" cy="16.5" rx="5" ry="4.2" />
            <ellipse cx="5.2" cy="10.6" rx="2" ry="2.5" />
            <ellipse cx="9.4" cy="5.8" rx="2.1" ry="2.6" />
            <ellipse cx="14.6" cy="5.8" rx="2.1" ry="2.6" />
            <ellipse cx="18.8" cy="10.6" rx="2" ry="2.5" />
        </svg>
    );
}
