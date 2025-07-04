//src/utils/logger.ts
import { getKSTTimestamp } from './time';

export function logger(...args: any[]): void {
  console.log(`[${getKSTTimestamp()}]`, ...args);
}
