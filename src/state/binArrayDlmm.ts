// src/state/binArrayDlmm.ts
import fs from 'fs';
import { Connection, PublicKey } from '@solana/web3.js';
import DLMM from '@meteora-ag/dlmm';
import { ROUTE_JSON_PATH } from '../config';

export async function processBinArraysDlmm(
  routePath: string = ROUTE_JSON_PATH,
  rpcUrl?: string
): Promise<void> {
  const RPC = rpcUrl || process.env.RPC_ENDPOINT!;
  const connection = new Connection(RPC, 'confirmed');
  const data = fs.readFileSync(routePath, 'utf-8');
  const route = JSON.parse(data);

  for (const key of ['buy', 'sell'] as const) {
    const sec = (route as any)[key];
    // sec가 없거나, pool_id 없거나, 타입이 DLMM이 아니면 건너뛴다
    if (
      !sec ||
      !sec[`${key}pool_id`] ||
      sec[`${key === 'buy' ? 'buy_type' : 'sell_type'}`]?.toUpperCase() !== 'DLMM'
    ) {
      continue;
    }

    try {
      const poolId = new PublicKey(sec[`${key}pool_id`]);
      const dlmmInstance: any = await DLMM.create(connection, poolId);
      const binArrays = await dlmmInstance.getBinArrayForSwap(key === 'buy', 4);

      // BinArray1~3 채우기
      [1, 2, 3].forEach(i => {
        const arr = binArrays[i - 1];
        sec[`BinArray${i}`] = arr?.publicKey.toBase58() ?? '';
      });
    } catch (err: any) {
      // DLMM decoding 에러가 나도 중단하지 않고 넘어간다
      console.warn(`processBinArraysDlmm ${key} 건너뜀:`, err.message);
      [1, 2, 3].forEach(i => {
        if (sec) sec[`BinArray${i}`] = '';
      });
    }
  }

  fs.writeFileSync(routePath, JSON.stringify(route, null, 2));
}
