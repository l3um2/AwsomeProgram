//src/types/RouteData.ts
export interface RouteData {
  name: string;  // 예: "CLONE/WSOL"
  diff: string;  // 예: "5.00"

  buy: {
    buy_type: string;
    buyPrice: string;
    buypool_id: string;
    buytvl: number | string;

    // V4 풀 디코딩 필드
    poolId?: string;
    baseMint?: string;
    quoteMint?: string;
    baseVault?: string;
    quoteVault?: string;
    openOrders?: string;
    targetOrders?: string;
    baseDecimal?: string;
    quoteDecimal?: string;
    
    // CPMM 풀 디코딩 필드
    AmmConfig?: string;
    token0Vault?: string;
    token1Vault?: string;
    token0Mint?: string;
    token1Mint?: string;
    ObservationKey?: string;

    // CLMM 풀 디코딩 필드
    bump?: number;
    ammConfig?: string;
    owner?: string;
    tokenMint0?: string;
    tokenMint1?: string;
    tokenVault0?: string;
    tokenVault1?: string;
    observationKey?: string;
    mintDecimals0?: number;
    mintDecimals1?: number;
    tickSpacing?: number;
    tickCurrent?: number;
    status?: number;
    tickArrayBitmap?: string;
    currentTickArray?: string;
    previousTickArray?: string;
    prepreviousTickArray?: string;
    nextTickArray?: string;
    nextnextTickArray?: string;
    BitmapExtension?: string;
    opentime?:string;

    // DLMM 풀 디코딩 필드
    tokenXMint?: string;
    tokenYMint?: string;
    reserveX?: string;
    reserveY?: string;
    oracle?: string;

    // DLMM 관련 bin array 필드
    BinArray1?: string;
    BinArray2?: string;
    BinArray3?: string;

    // Orca 풀 디코딩 필드
    tokenVaultA?: string;
    tokenVaultB?: string;
    tokenMintA?: string;
    tokenMintB?: string;
    sqrtPrice?: string;
    OrcatickSpacing?: number;
    tickCurrentIndex?: string;
    tickarray_2?: string;
    tickarray_1?: string;
    tickarray0?: string;
    tickarray1?: string;
    tickarray2?: string;
    oracleAddress?: string;




  };

  sell: {
    sell_type: string;
    sellPrice: string;
    sellpool_id: string;
    selltvl: number | string;

    // V4 풀 디코딩 필드
    poolId?: string;
    baseMint?: string;
    quoteMint?: string;
    baseVault?: string;
    quoteVault?: string;
    openOrders?: string;
    targetOrders?: string;
    baseDecimal?: string;
    quoteDecimal?: string;

    // CPMM 풀 디코딩 필드
    AmmConfig?: string;
    token0Vault?: string;
    token1Vault?: string;
    token0Mint?: string;
    token1Mint?: string;
    ObservationKey?: string;
      
    // CLMM 풀 디코딩 필드
    bump?: number;
    ammConfig?: string;
    owner?: string;
    tokenMint0?: string;
    tokenMint1?: string;
    tokenVault0?: string;
    tokenVault1?: string;
    observationKey?: string;
    mintDecimals0?: number;
    mintDecimals1?: number;
    tickSpacing?: number;
    tickCurrent?: number;
    status?: number;
    tickArrayBitmap?: string;
    currentTickArray?: string;
    previousTickArray?: string;
    prepreviousTickArray?: string;
    nextTickArray?: string;
    nextnextTickArray?: string;
    exBitmapAccount?: string;

    // DLMM 풀 디코딩 필드
    tokenXMint?: string;
    tokenYMint?: string;
    reserveX?: string;
    reserveY?: string;
    oracle?: string;

    // DLMM 관련 bin array 필드
    BinArray1?: string;
    BinArray2?: string;
    BinArray3?: string;

    // Orca 풀 디코딩 필드
    tokenVaultA?: string;
    tokenVaultB?: string;
    tokenMintA?: string;
    tokenMintB?: string;
    sqrtPrice?: string;
    OrcatickSpacing?: number;
    tickCurrentIndex?: string;
    tickarray_2?: string;
    tickarray_1?: string;
    tickarray0?: string;
    tickarray1?: string;
    tickarray2?: string;
    oracleAddress?: string;


  };

  // 최적 매수 SOL 및 예상 수령 토큰
  optimalBuySol?: number;
  expectedBuyToken?: number;
}
