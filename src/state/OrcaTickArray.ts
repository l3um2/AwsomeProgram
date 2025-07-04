// src/state/OrcaTickArray.ts
import fs from 'fs';
import { Connection } from '@solana/web3.js';
import {
  getTickArrayAddress,
  WHIRLPOOL_PROGRAM_ADDRESS,
  getOracleAddress,
} from '@orca-so/whirlpools-client';
import { getTickArrayStartTickIndex } from '@orca-so/whirlpools-core';
import { setWhirlpoolsConfig } from '@orca-so/whirlpools';
import { ROUTE_JSON_PATH } from '../config';

/**
 * route.json 의 buy/sell 섹션에 있는
 * poolId, tickCurrent, OrcatickSpacing 으로부터
 * 주변 5개(tickArray ±2) PDA 와 oracle PDA 를 계산해 덮어씁니다.
 */
export async function processOrcaTickArrays(
  routePath: string = ROUTE_JSON_PATH,
  rpcUrl?: string
): Promise<void> {
  // 1) Orca 프로그램 ID 설정
  setWhirlpoolsConfig(WHIRLPOOL_PROGRAM_ADDRESS);

  // 2) RPC 연결 (processed)
  const RPC = rpcUrl || process.env.RPC_ENDPOINT!;
  const connection = new Connection(RPC, 'processed');

  // 3) route.json 읽기
  const raw = fs.readFileSync(routePath, 'utf-8');
  const route: Record<string, any> = JSON.parse(raw);

  // 4) 각 buy/sell 섹션마다 oracle PDA + tick‐array PDA 계산
  for (const side of ['buy', 'sell'] as const) {
    const sec = route[side];
    if (
      !sec ||
      typeof sec.poolId !== 'string' ||
      typeof sec.tickCurrentIndex !== 'number' ||
      typeof sec.OrcatickSpacing !== 'number'
    ) {
      continue;
    }

    const whirlpoolAddr = sec.poolId;
    const currentTick   = sec.tickCurrentIndex;
    const spacing       = sec.OrcatickSpacing;

    // --- oracle PDA 계산 ---
    const [oracleAddress, oracleBump] = await getOracleAddress(whirlpoolAddr);
    sec.oracleAddress = oracleAddress;
    sec.oracleBump    = oracleBump;

    // 배열 크기 (Orca는 88)
    const ARRAY_SIZE = 88;
    // 중앙 tick array 시작 인덱스
    const baseStart = getTickArrayStartTickIndex(currentTick, spacing);

    // offsets: 0 (current), -1, -2, +1, +2
    const offsets    = [0, -1, -2, 1, 2];
    const fieldNames = [
      'currentTickArray',
      'previousTickArray',
      'prepreviousTickArray',
      'nextTickArray',
      'nextnextTickArray',
    ] as const;

    for (let i = 0; i < offsets.length; i++) {
      const delta    = offsets[i];
      const startIdx = baseStart + delta * spacing * ARRAY_SIZE;

      // PDA 계산 (await 필수)
      const [addr, bump] = await getTickArrayAddress(
        whirlpoolAddr,
        startIdx
      );

      // 결과를 route.json 객체에 기록
      sec[fieldNames[i]]             = addr;
      sec[`${fieldNames[i]}StartIdx`] = startIdx;
      sec[`${fieldNames[i]}Bump`]     = bump;
    }
  }

  // 5) 덮어쓰기
  fs.writeFileSync(routePath, JSON.stringify(route, null, 2));
  console.log('✅ processOrcaTickArrays: tick arrays & oracle saved to', routePath);
}
