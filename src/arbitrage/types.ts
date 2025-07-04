// src/arbitrage/types.ts

export interface PriceUpdate {
  poolId:     string;
  tokenMint:  string;
  buyPrice:   number;   // 1 SOL 투입 시 받을 Token 수량
  sellPrice:  number;   // 1 SOL 얻기 위해 투입할 Token 수량
  liquidity:  number;   // TVL or depth 정보
}

export interface ArbitrageOpportunity {
  tokenMint: string;
  buyPool:   string;     // 우리가 SOL → Token 매수할 풀
  sellPool:  string;     // 우리가 Token → SOL 매도할 풀
  buyPrice:  number;     // 위 buyPool 의 buyPrice
  sellPrice: number;     // 위 sellPool 의 sellPrice
  difference:number;     // (buyPrice / sellPrice) - 1
}
