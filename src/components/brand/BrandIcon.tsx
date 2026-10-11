import type { CSSProperties, ReactNode, SVGProps } from 'react';

/**
 * The Tulzo robot, drawn once and reused by the mark and the four surface icons.
 *
 * Geometry is the idle face of the assistant's VoiceRobot
 * (assistant/plugin/src/panel/components/VoiceRobot.tsx) on a 100x100 grid:
 * antenna + dot, a rounded-square head, two dot eyes, a flat mouth, two feet.
 * Strokes use `currentColor` with a non-scaling width, so every icon has the
 * same line weight at a given size and follows the theme through CSS `color`.
 */

export interface BrandIconProps {
  /** Rendered width and height in px. */
  size?: number;
  /** Accessible name. Without it the icon is decorative (aria-hidden). */
  title?: string;
  className?: string;
  style?: CSSProperties;
}

/** Stroke width in screen px: thicker at small sizes so 16px stays legible. */
export function strokeFor(size: number): number {
  if (size <= 16) return 1.5;
  if (size <= 24) return 2;
  return Math.round(size / 16);
}

const NS = { vectorEffect: 'non-scaling-stroke' } as const;

export const Line = (p: SVGProps<SVGLineElement>) => <line {...NS} {...p} />;
export const Rect = (p: SVGProps<SVGRectElement>) => <rect {...NS} {...p} />;
export const Path = (p: SVGProps<SVGPathElement>) => <path {...NS} {...p} />;
export const Ring = (p: SVGProps<SVGCircleElement>) => <circle {...NS} {...p} />;
export const Dot = (p: SVGProps<SVGCircleElement>) => <circle fill="currentColor" stroke="none" {...p} />;

function Robot() {
  return (
    <>
      <Line x1={50} y1={7} x2={50} y2={16} />
      <Dot cx={50} cy={6} r={5} />
      <Rect x={20} y={16} width={60} height={62} rx={12} />
      <Dot cx={35} cy={42} r={6.5} />
      <Dot cx={65} cy={42} r={6.5} />
      <Line x1={41} y1={61} x2={59} y2={61} />
      <Line x1={34} y1={78} x2={34} y2={88} />
      <Line x1={66} y1={78} x2={66} y2={88} />
    </>
  );
}

export function BrandSvg({
  size = 24,
  title,
  className,
  style,
  children,
}: BrandIconProps & { children: ReactNode }) {
  const labelled = !!title;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeFor(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      {labelled && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** The robot alone, full size. */
export function RobotFull() {
  return <Robot />;
}

/** The robot shrunk into the lower left (x 4-46), leaving x 50-96 for a prop. */
export function RobotWithProp({ children }: { children: ReactNode }) {
  return (
    <>
      <g transform="translate(-10 30) scale(0.7)">
        <Robot />
      </g>
      {children}
    </>
  );
}
