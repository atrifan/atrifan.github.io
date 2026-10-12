import { Fragment, type ReactNode } from 'react';
import { BrandSvg, Line, Path, type BrandIconProps } from './BrandIcon';

/**
 * Inline UI glyphs (arrows, pause) drawn in the brand stroke style, so they look the same on every
 * platform instead of falling back to whatever font has U+2190 / U+2192 / U+23F8 (the Linux
 * Playwright image draws them from a different font than macOS).
 *
 * Each icon defaults its accessible name to the character it replaces, so the text a screen reader
 * hears (and a link's name, e.g. "← All gigs") is unchanged. Pass `title=""` for a decorative icon.
 * They sit on the text baseline at 1em-ish sizes via the `.inline-icon` class (styles/globals.css).
 */

type InlineIconProps = Omit<BrandIconProps, 'title'> & { title?: string };

function inline({ size = 14, title, className, style }: InlineIconProps, fallbackTitle: string): BrandIconProps {
  return {
    size,
    title: title === undefined ? fallbackTitle : title || undefined,
    className: className ? `inline-icon ${className}` : 'inline-icon',
    style,
  };
}

export function ArrowLeftIcon(props: InlineIconProps) {
  return (
    <BrandSvg {...inline(props, '←')}>
      <Line x1={84} y1={50} x2={16} y2={50} />
      <Path d="M44 22 L16 50 L44 78" />
    </BrandSvg>
  );
}

export function ArrowRightIcon(props: InlineIconProps) {
  return (
    <BrandSvg {...inline(props, '→')}>
      <Line x1={16} y1={50} x2={84} y2={50} />
      <Path d="M56 22 L84 50 L56 78" />
    </BrandSvg>
  );
}

export function PauseIcon(props: InlineIconProps) {
  return (
    <BrandSvg {...inline(props, '⏸')}>
      <Line x1={36} y1={20} x2={36} y2={80} />
      <Line x1={64} y1={20} x2={64} y2={80} />
    </BrandSvg>
  );
}

const GLYPH_ICONS: Record<string, (props: InlineIconProps) => ReactNode> = {
  '←': ArrowLeftIcon,
  '→': ArrowRightIcon,
  '⏸': PauseIcon,
};

/** A text with its ←, → and ⏸ characters drawn as the inline icons above (for strings built elsewhere). */
export function withGlyphIcons(text: string, props: InlineIconProps = {}): ReactNode {
  const parts = text.split(/([←→⏸])/);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const Icon = GLYPH_ICONS[part];
    return Icon ? <Icon key={i} {...props} /> : <Fragment key={i}>{part}</Fragment>;
  });
}
