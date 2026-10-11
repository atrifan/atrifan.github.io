import { BrandSvg, RobotFull, type BrandIconProps } from './BrandIcon';

/** The Tulzo mark: the line-art robot, idle face. Colour comes from CSS `color`. */
export function TulzoMark(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <RobotFull />
    </BrandSvg>
  );
}
