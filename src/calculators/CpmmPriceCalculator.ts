//src/calculators/CpmmPriceCalculator.ts
import { Connection, PublicKey, Commitment, AccountInfo } from '@solana/web3.js';
import { PRICE_SOL_AMOUNT } from '../config';
import { CurveCalculator, ApiV3Token } from '@raydium-io/raydium-sdk-v2';
import { NATIVE_MINT } from '@solana/spl-token';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { CpmmDecoder, CpmmPoolState } from '../decoders/CpmmDecoder';

export interface CpmmPriceInfo {
  spotPrice: number;   // 1 A토큰당 SOL 기준 스폿 가격
  buyPrice: number;    // PRICE_SOL_AMOUNT SOL 투입 시 받을 토큰 수
  sellPrice: number;   // PRICE_SOL_AMOUNT SOL 얻기 위해 투입할 토큰 수
}

export async function calculateCpmmPrices(
  connection: Connection,
  poolId: PublicKey,
  commitment: Commitment = 'processed'
): Promise<CpmmPriceInfo> {
  // 1) 계정 읽기
  const acc: AccountInfo<Buffer> | null = await connection.getAccountInfo(poolId, commitment);
  if (!acc) throw new Error('Pool account not found');

  // 2) 디코더 사용
  const state: CpmmPoolState = CpmmDecoder.decode(acc.data as Buffer);

  // 3) SOL 여부 및 ApiV3Token 구성
  const solIsToken0 = new PublicKey(state.token0Mint).equals(NATIVE_MINT);
  const tokenSOL: ApiV3Token = {
    chainId: 101,
    address: solIsToken0 ? state.token0Mint : state.token1Mint,
    programId: '', symbol: '', name: '', logoURI: '', tags: [], extensions: {},
    decimals: solIsToken0 ? state.mint0Decimals : state.mint1Decimals,
  } as any;
  const tokenA: ApiV3Token = {
    chainId: 101,
    address: solIsToken0 ? state.token1Mint : state.token0Mint,
    programId: '', symbol: '', name: '', logoURI: '', tags: [], extensions: {},
    decimals: solIsToken0 ? state.mint1Decimals : state.mint0Decimals,
  } as any;


  // 4) 리저브 조회
  const vault0 = new PublicKey(state.token0Vault);
  const vault1 = new PublicKey(state.token1Vault);
  const [bal0, bal1] = await Promise.all([
    connection.getTokenAccountBalance(vault0, commitment),
    connection.getTokenAccountBalance(vault1, commitment),
  ]);
  const solReserve = new BN(solIsToken0 ? bal0.value.amount : bal1.value.amount);
  const aReserve   = new BN(solIsToken0 ? bal1.value.amount : bal0.value.amount);

  if (solReserve.isZero() || aReserve.isZero()) throw new Error('풀 유동성이 부족합니다');

  // 5) spotPrice 계산 (1 A당 SOL)
  const solNorm = new Decimal(solReserve.toString()).div(new Decimal(10).pow(tokenSOL.decimals));
  const aNorm   = new Decimal(aReserve.toString()).div(new Decimal(10).pow(tokenA.decimals));
  const spotPrice = solNorm.div(aNorm).toNumber();

  // 6) PRICE_SOL_AMOUNT → lamports
  const lamportsSol = new BN(
    new Decimal(PRICE_SOL_AMOUNT)
      .mul(new Decimal(10).pow(tokenSOL.decimals))
      .floor()
      .toFixed(0)
  );

  // 7) feeRate
  const feeRate = new BN(25);

  // 8) BUY: SOL → A
  const swapOut = CurveCalculator.swap(
    lamportsSol,
    solReserve,
    aReserve,
    feeRate
  );
  const aReceived = new Decimal(swapOut.destinationAmountSwapped.toString())
    .div(new Decimal(10).pow(tokenA.decimals));

  // 9) SELL: A → SOL
  const swapIn = CurveCalculator.swapBaseOut({
    poolMintA: tokenSOL,
    poolMintB: tokenA,
    tradeFeeRate: feeRate,
    baseReserve: solReserve,
    quoteReserve: aReserve,
    outputMint: tokenSOL.address,
    outputAmount: lamportsSol,
  });
  const solReceived = new Decimal(swapIn.amountIn.toString())
    .div(new Decimal(10).pow(tokenSOL.decimals));

  return {
    spotPrice,
    buyPrice:  Number(aReceived.toFixed(6)),
    sellPrice: Number(solReceived.toFixed(6)),
  };
}