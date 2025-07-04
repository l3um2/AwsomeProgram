//src/state/ClmmTickArray.ts
import fs from 'fs';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  POOL_TICK_ARRAY_BITMAP_SEED,
  TICK_ARRAY_SIZE,
  TickUtils,
  getPdaTickArrayAddress,
} from '@raydium-io/raydium-sdk-v2';
import { ROUTE_JSON_PATH } from '../config';

/**
 * Ex‑Bitmap PDA 계산
 */
export function getPdaExBitmapAccount(
  programId: PublicKey,
  poolId: PublicKey
): { publicKey: PublicKey | null; nonce: number | null } {
  try {
    const [pda, nonce] = PublicKey.findProgramAddressSync(
      [POOL_TICK_ARRAY_BITMAP_SEED, poolId.toBuffer()],
      programId
    );
    return { publicKey: pda, nonce };
  } catch (err) {
    console.error('getPdaExBitmapAccount 에러:', err);
    return { publicKey: null, nonce: null };
  }
}

export async function processClmmTickArrays(
  routePath: string = ROUTE_JSON_PATH,
  rpcUrl?: string
): Promise<void> {
  const RPC = rpcUrl || process.env.RPC_ENDPOINT!;
  const connection = new Connection(RPC, 'confirmed');

  // 1) route.json 읽기
  const raw = fs.readFileSync(routePath, 'utf-8');
  const route: any = JSON.parse(raw);

  // 2) Raydium 프로그램 ID (예제)
  const RAYDIUM_PROGRAM_ID = new PublicKey(
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'
  );

  // 3) buy / sell 섹션마다 PDA 계산
  for (const key of ['buy', 'sell'] as const) {
    const sec = route[key];
    if (
      !sec ||
      !sec.poolId ||
      sec.tickSpacing == null ||
      sec.tickCurrent == null
    ) {
      continue;
    }

    const poolId = new PublicKey(sec.poolId);
    const spacing = sec.tickSpacing as number;
    const currentTick = sec.tickCurrent as number;

    const startIndex = TickUtils.getTickArrayStartIndexByTick(
      currentTick,
      spacing
    );

    // 순서대로: [current, exBitmap, prev, preprev, next, nextnext]
    const accounts = [
      // current tick array
      getPdaTickArrayAddress(RAYDIUM_PROGRAM_ID, poolId, startIndex).publicKey,
      // ex‑bitmap PDA
      getPdaExBitmapAccount(RAYDIUM_PROGRAM_ID, poolId).publicKey!,
      // 이전 1, 이전 2, 다음 1, 다음 2
      ...[-1, -2, 1, 2].map((i) =>
        getPdaTickArrayAddress(
          RAYDIUM_PROGRAM_ID,
          poolId,
          startIndex + i * spacing * TICK_ARRAY_SIZE
        ).publicKey
      ),
    ];

    const fields = [
      'currentTickArray',
      'exBitmapAccount',
      'previousTickArray',
      'prepreviousTickArray',
      'nextTickArray',
      'nextnextTickArray',
    ] as const;

    fields.forEach((f, idx) => {
      sec[f] = accounts[idx]?.toBase58() ?? null;
    });
  }

  // 4) 파일에 한 번에 덮어쓰기
  try {
    fs.writeFileSync(routePath, JSON.stringify(route, null, 2));
    console.log('processTickArrays: TickArray 및 exBitmap 저장 완료');
  } catch (err) {
    console.error('processTickArrays: 파일 쓰기 실패', err);
  }
}
