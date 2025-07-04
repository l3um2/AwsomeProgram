// src/calculators/ClmmPriceCalculator.ts
import { Connection, PublicKey, Commitment, AccountInfo } from '@solana/web3.js';
import { ClmmDecoder, ClmmPoolState } from '../decoders/ClmmDecoder';
import BigNumber from 'bignumber.js';
import { SqrtPriceMath } from '@raydium-io/raydium-sdk-v2';
import { NATIVE_MINT } from '@solana/spl-token';
import Decimal from 'decimal.js';
import { PRICE_SOL_AMOUNT } from '../config';

BigNumber.config({ DECIMAL_PLACES: 50 });

export interface ClmmPriceInfo {
  spotPrice: number;   // 1 토큰당 SOL 가격
  buyPrice: number;    // PRICE_SOL_AMOUNT SOL 투입 시 받을 토큰 수
  sellPrice: number;   // PRICE_SOL_AMOUNT SOL 얻기 위해 투입할 토큰 수
}

export async function calculateClmmPrices(
  connection: Connection,
  poolId: PublicKey,
  commitment: Commitment = 'processed'
): Promise<ClmmPriceInfo> {
  // 1) 풀 raw data 조회
  const acc: AccountInfo<Buffer> | null = await connection.getAccountInfo(poolId, commitment);
  if (!acc) throw new Error('Pool account not found');

  // 2) 디코딩
  const state: ClmmPoolState = ClmmDecoder.decode(acc.data);

  const mint0 = new PublicKey(state.tokenMint0);
  const mint1 = new PublicKey(state.tokenMint1);

  // SOL 포함 풀만 지원
  const solIsToken0 = mint0.equals(NATIVE_MINT);
  if (!solIsToken0 && !mint1.equals(NATIVE_MINT)) {
    throw new Error('풀에 SOL이 포함되어 있지 않습니다');
  }

  const decimals0 = state.mintDecimals0;
  const decimals1 = state.mintDecimals1;
  const liquidity = new BigNumber(state.liquidity.toString());
  const sqrtPx64  = new BigNumber(state.sqrtPriceX64.toString());
  const twoPow64  = new BigNumber(2).pow(64);

  // 3) spot price: (sqrtPrice)^2 × decimalAdj  => token per token
  const sqrtPrice = sqrtPx64.dividedBy(twoPow64);
  const rawPrice  = sqrtPrice.pow(2);
  const decimalAdj = new BigNumber(10)
    .pow(new BigNumber(decimals0).minus(decimals1));
  const spotPrice = rawPrice.multipliedBy(decimalAdj).toNumber();

  // 4) lamports 단위로 변환
  const solAmtLamports = new BigNumber(PRICE_SOL_AMOUNT)
    .multipliedBy(new BigNumber(10).pow(solIsToken0 ? decimals0 : decimals1))
    .integerValue(BigNumber.ROUND_FLOOR);

  // 5) buy: SOL 투입 → 받을 토큰 수
    // BUY (SOL→A)
    const nextAfterBuy = SqrtPriceMath.getNextSqrtPriceX64FromInput(
      BigNumberToBN(sqrtPx64),
      BigNumberToBN(liquidity),
      BigNumberToBN(solAmtLamports),
      solIsToken0              // input=SOL(token0)일 땐 true
    );  const priceAfterBuy = SqrtPriceMath.sqrtPriceX64ToPrice(
    nextAfterBuy,
    decimals0,
    decimals1
  );
  const aPerSolBuy = solIsToken0
    ? priceAfterBuy
    : new Decimal(1).div(priceAfterBuy);
  const buyPrice = Number(
    aPerSolBuy.mul(PRICE_SOL_AMOUNT).toFixed(6)
  );

    // 6) sell: 1 SOL 받기 위해 투입할 토큰 수
// SELL (A→SOL)
  const nextAfterSell = SqrtPriceMath.getNextSqrtPriceX64FromOutput(
      BigNumberToBN(sqrtPx64),
      BigNumberToBN(liquidity),
      BigNumberToBN(solAmtLamports),
      !solIsToken0             // input=A(token1)일 땐 false → 반대 방향
    );
  const priceAfterSell = SqrtPriceMath.sqrtPriceX64ToPrice(
    nextAfterSell,
    decimals0,
    decimals1
  );
  const aPerSolSell = solIsToken0
    ? priceAfterSell
    : new Decimal(1).div(priceAfterSell);
  const sellPrice = Number(
    aPerSolSell.mul(PRICE_SOL_AMOUNT).toFixed(6)
  );

  return {
    spotPrice,
    buyPrice,
    sellPrice,
  };
}

// 설치된 BN 라이브러리가 필요할 경우
import BN from 'bn.js';
function BigNumberToBN(bn: BigNumber): BN {
  return new BN(bn.toFixed(0));
}
