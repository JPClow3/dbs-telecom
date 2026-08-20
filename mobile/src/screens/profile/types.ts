import { LIGHT_COLORS } from '../../constants/theme';

export type ProfileColors = typeof LIGHT_COLORS;

export interface PingResult {
  latency: string;
  speed: string;
  status: string;
}
