// src/arbitrage/groupManager.ts
import { PriceUpdate, ArbitrageOpportunity } from "./types";

export class GroupManager {
  private groups = new Map<string, PriceUpdate[]>();

  addPriceUpdate(update: PriceUpdate): void {
    const arr = this.groups.get(update.tokenMint) ?? [];
    // replace 기존 항목 있으면 덮어쓰기
    const idx = arr.findIndex(u => u.poolId === update.poolId);
    if (idx >= 0) arr[idx] = update;
    else          arr.push(update);
    this.groups.set(update.tokenMint, arr);
  }

  checkArbitrage(threshold: number): ArbitrageOpportunity | null {
    for (const [tokenMint, updates] of this.groups.entries()) {
      if (updates.length < 2) continue;

      // 1) 최대 buyPrice 풀 찾기
      const bestBuy = updates.reduce((prev, cur) =>
        cur.buyPrice > prev.buyPrice ? cur : prev
      );

      // 2) 같은 풀 제외하고, 최소 sellPrice 풀 찾기
      const candidates = updates.filter(u => u.poolId !== bestBuy.poolId);
      if (candidates.length === 0) continue;
      const bestSell = candidates.reduce((prev, cur) =>
        cur.sellPrice < prev.sellPrice ? cur : prev
      );

      // 3) 차익률 계산: (buyPrice / sellPrice) - 1
      const diff = bestBuy.buyPrice / bestSell.sellPrice - 1;
      if (diff >= threshold) {
        return {
          tokenMint,
          buyPool:    bestBuy.poolId,
          sellPool:   bestSell.poolId,
          buyPrice:   bestBuy.buyPrice,
          sellPrice:  bestSell.sellPrice,
          difference: diff,
        };
      }
    }
    return null;
  }
}
