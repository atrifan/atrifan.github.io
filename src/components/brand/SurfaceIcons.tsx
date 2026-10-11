import { BrandSvg, Dot, Line, Path, Rect, Ring, RobotWithProp, type BrandIconProps } from './BrandIcon';
import type { Surface } from '@/src/lib/surface-url';
import type { ComponentType } from 'react';

/** ai. surface: the robot with a key (API keys, devices, usage). */
export function AiIcon(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <RobotWithProp>
        <Ring cx={74} cy={28} r={14} />
        <Line x1={74} y1={42} x2={74} y2={92} />
        <Line x1={74} y1={72} x2={87} y2={72} />
        <Line x1={74} y1={85} x2={85} y2={85} />
      </RobotWithProp>
    </BrandSvg>
  );
}

/** marketplace. surface: the robot with a plug (MCP servers, skills, plugins). */
export function MarketIcon(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <RobotWithProp>
        <Line x1={65} y1={18} x2={65} y2={34} />
        <Line x1={83} y1={18} x2={83} y2={34} />
        <Rect x={54} y={34} width={40} height={30} rx={7} />
        <Line x1={74} y1={64} x2={74} y2={92} />
      </RobotWithProp>
    </BrandSvg>
  );
}

/** gigs. surface: the robot with a briefcase (jobs). */
export function GigsIcon(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <RobotWithProp>
        <Path d="M63 42 V33 a6 6 0 0 1 6 -6 h8 a6 6 0 0 1 6 6 V42" />
        <Rect x={52} y={42} width={42} height={44} rx={8} />
        <Line x1={52} y1={60} x2={94} y2={60} />
      </RobotWithProp>
    </BrandSvg>
  );
}

/** chat. surface: the robot with a speech bubble (remote chat). */
export function ChatIcon(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <RobotWithProp>
        <Path d="M58 6 h30 a8 8 0 0 1 8 8 v18 a8 8 0 0 1 -8 8 h-18 l-12 10 v-10 a8 8 0 0 1 -8 -8 v-18 a8 8 0 0 1 8 -8 z" />
        <Dot cx={62} cy={23} r={4.5} />
        <Dot cx={73} cy={23} r={4.5} />
        <Dot cx={84} cy={23} r={4.5} />
      </RobotWithProp>
    </BrandSvg>
  );
}

/** Icon per surface, for the nav and surface pages. The hub uses TulzoMark. */
export const SURFACE_ICON: Readonly<Record<Exclude<Surface, 'hub'>, ComponentType<BrandIconProps>>> = {
  ai: AiIcon,
  marketplace: MarketIcon,
  gigs: GigsIcon,
  chat: ChatIcon,
};
