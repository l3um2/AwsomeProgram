//src/calculators/AmmV4PriceCalculator.ts
import { Connection, PublicKey, Commitment, AccountInfo } from "@solana/web3.js";
import { liquidityStateV4Layout } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { PRICE_SOL_AMOUNT } from "../config";    // ← 추가
                                        
/** 리턴할 가격 정보 */
export interface AmmV4PriceInfo {
  spotPrice: number;   // base 1개당 quote
  buyPrice: number;    // A per PRICE_SOL_AMOUNT SOL
  sellPrice: number;   // PRICE_SOL_AMOUNT SOL per A
}

export async function calculateAmmV4Prices(
  connection: Connection,
  poolId: PublicKey,
  commitment: Commitment = 'processed'
): Promise<AmmV4PriceInfo> {
  // 1) 풀 raw data 조회 & 디코딩
  const acc = await connection.getAccountInfo(poolId, commitment);
  if (!acc) throw new Error("Pool account not found");
  const data: any = liquidityStateV4Layout.decode(acc.data);

  // 2) vault 주소, PnL 추출
  const vaultA = new PublicKey(data.baseVault);
  const vaultB = new PublicKey(data.quoteVault);
  const [balA, balB] = await Promise.all([
    connection.getTokenAccountBalance(vaultA, commitment),
    connection.getTokenAccountBalance(vaultB, commitment),
  ]);
  const basePnlUi  = Number((data.baseNeedTakePnl as BN).toString())  / 10**balA.value.decimals;
  const quotePnlUi = Number((data.quoteNeedTakePnl as BN).toString()) / 10**balB.value.decimals;

  // 3) PnL 제거된 순수 리저브 (UI 단위)
  const netA = (balA.value.uiAmount ?? 0) - basePnlUi;
  const netB = (balB.value.uiAmount ?? 0) - quotePnlUi;
  if (netA <= 0) throw new Error("Effective base amount is zero or negative");

  // 4) 스폿 가격
  const spotPrice = netB / netA;

  // 5) 수수료 보정 계수 계산
  const feeFrac = 1 - (Number(data.tradeFeeNumerator) / Number(data.tradeFeeDenominator));

  // 6) swapIn: SOL 투입 → 받을 A 수량
  function swapIn(aRes: number, sRes: number, amt: number, f: number) {
    const eff = amt * f;
    const newS = (sRes * aRes) / (aRes + eff);
    return sRes - newS;
  }

  // 7) swapOut: A 투입 → 받을 SOL 수량
  function swapOut(aRes: number, sRes: number, amtOut: number, f: number) {
    const sAfter = sRes - amtOut;
    const aWithF = (aRes * sRes) / sAfter - aRes;
    return aWithF / f;
  }

  // 8) 어떤 토큰이 SOL인지 판별해서 리저브 자리 맞추기
  const baseMint = new PublicKey(data.baseMint);
  const solIsBase = baseMint.equals(NATIVE_MINT);
  const aRes = solIsBase ? netA : netB;
  const sRes = solIsBase ? netB : netA;

  // 9) config 에서 불러온 SOL 수량으로 가격 계산
  const solAmt = PRICE_SOL_AMOUNT;
  const buyPrice  = swapIn(aRes, sRes, solAmt, feeFrac);
  const sellPrice = swapOut(sRes, aRes, solAmt, feeFrac);

  return {
    spotPrice,
    buyPrice,
    sellPrice,
  };
}
