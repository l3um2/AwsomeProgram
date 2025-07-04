// src/decoders/index.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { RPC_ENDPOINT } from '../config';
import { AmmV4Decoder }   from './AmmV4Decoder';
import { CpmmDecoder }    from './CpmmDecoder';
import { ClmmDecoder }    from './ClmmDecoder';
import { DlmmDecoder }    from './DlmmDecoder';
import { OrcaDecoder }     from './OrcaDecoder';

// 전역 커넥션 재사용
const sharedConnection = new Connection(RPC_ENDPOINT, 'confirmed');

export async function decodePool(
  poolId: string,
  poolType: string
): Promise<any | null> {
  // 1) accountInfo 를 매번 새로 불러오지 않도록, 호출부에서 onAccountChange data 가 있을 때 직접 decode(buffer) 만 활용하세요.
  const info = await sharedConnection.getAccountInfo(new PublicKey(poolId));
  if (!info) {
    console.error(`decodePool: no account data for ${poolId}`);
    return null;
  }
  const buf = info.data;

  switch (poolType.toLowerCase()) {
    case 'v4':  return AmmV4Decoder.decode(buf);
    case 'cpmm':return CpmmDecoder.decode(buf);
    case 'clmm':return ClmmDecoder.decode(buf);
    case 'dlmm':return DlmmDecoder.decode(buf);
    case 'orca': return OrcaDecoder.decode(buf);
    default:
      console.error(`decodePool: unknown pool type "${poolType}"`);
      return null;
  }
}
