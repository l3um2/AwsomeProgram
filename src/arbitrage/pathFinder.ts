// src/arbitrage/pathFinder.ts
import { ArbitrageOpportunity } from "./types";

export interface ArbitragePath {
  description:      string;
  optimalBuySol:    number;
  expectedBuyToken: number;
}

export function findArbitragePath(
  opp: ArbitrageOpportunity,
  minSol: number,
  maxSol: number,
  tokenMultiplier: number
): ArbitragePath {
  const { buyPrice: Pbuy, sellPrice: Psell, buyPool, sellPool, difference } = opp;

  // (옵션) TVL 기반으로 실제 투입 한도를 계산하려면
  // opportunity 에 tvl 필드를 추가하거나 호출부에서 인자로 넘겨줘야 합니다.

  // 여기서는 단순히 min/max Sol clamp 적용
  let optimalBuySol = Math.sqrt(Psell / Pbuy) * (minSol + maxSol) / 2;
  optimalBuySol = Math.max(minSol, Math.min(maxSol, optimalBuySol));

  // 예상 토큰 수 = (투입 SOL량 × buyPrice) × multiplier
  const expectedBuyToken = optimalBuySol * Pbuy * tokenMultiplier;

  const description = 
    `Buy @${buyPool} (get ${Pbuy.toFixed(6)} token/SOL), ` +
    `Sell @${sellPool} (cost ${Psell.toFixed(6)} token/SOL), ` +
    `Δ=${(difference*100).toFixed(2)}%`;

  return { description, optimalBuySol, expectedBuyToken };
}
