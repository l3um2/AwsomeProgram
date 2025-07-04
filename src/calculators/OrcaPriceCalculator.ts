//src/calculators/OrcaPriceCalculator.ts
import { Connection, PublicKey, Commitment, AccountInfo } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import BigNumber from 'bignumber.js';
import { OrcaDecoder, WhirlpoolState } from '../decoders/OrcaDecoder';

// 충분한 정밀도 설정
BigNumber.config({ DECIMAL_PLACES: 50 });

/**
 * Orca Whirlpool 풀에서 √price 기반으로 가격 계산 모듈
 *
 * @param connection Solana RPC Connection
 * @param poolId Whirlpool 풀 계정 PublicKey
 * @param commitment RPC commitment level (기본 'processed')
 * @returns 기준 토큰 A 1개당 토큰 B 가격 (number)
 */
export async function calculateOrcaPrice(
  connection: Connection,
  poolId: PublicKey,
  commitment: Commitment = 'processed'
): Promise<number> {
  // 1) 계정 정보 조회
  const acc: AccountInfo<Buffer> | null = await connection.getAccountInfo(
    poolId,
    commitment
  );
  if (!acc) throw new Error('Whirlpool account not found');

  // 2) 디코딩
  const state: WhirlpoolState = OrcaDecoder.decode(acc.data);

  // 3) √price (Q64) → BigNumber
  const sqrtPriceX64 = new BigNumber(state.sqrtPrice);
  const twoPow64 = new BigNumber(2).pow(64);
  const sqrtPrice = sqrtPriceX64.dividedBy(twoPow64);

  // 4) raw price 계산
  const rawPrice = sqrtPrice.pow(2);

  // 5) mint decimals 조회
  const [mintA, mintB] = await Promise.all([
    getMint(connection, new PublicKey(state.tokenMintA), commitment),
    getMint(connection, new PublicKey(state.tokenMintB), commitment),
  ]);
  const decimalAdj = new BigNumber(10).pow(
    new BigNumber(mintA.decimals).minus(mintB.decimals)
  );

  // 6) 최종 가격
  const finalPrice = rawPrice.multipliedBy(decimalAdj);
  return finalPrice.toNumber();
}
