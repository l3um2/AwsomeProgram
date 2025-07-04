// src/app.ts
import fs from 'fs';
import path from 'path';
import { Connection, PublicKey, AccountInfo, SendTransactionError } from '@solana/web3.js';

import { fetchPools } from "./tasks/fetchPools";
import { decodePool } from './decoders';
import { calculateAmmV4Prices, calculateCpmmPrices, calculateClmmPrices, calculateDlmmPrices, calculateOrcaPrice } from './calculators';
import { PriceMonitor } from './arbitrage/priceMonitor';
import { PriceUpdate, ArbitrageOpportunity } from './arbitrage/types';
import { getKSTTimestamp } from './utils/time';
import { findArbitragePath } from './arbitrage/pathFinder';
import { processClmmTickArrays } from './state/ClmmTickArray';
import { processOrcaTickArrays } from './state/OrcaTickArray';
import { processBinArraysDlmm } from './state/binArrayDlmm';
import { sendSwapTransaction } from './swap/jito';
import { RouteData } from './types/RouteData';
import { PRICE_SOL_AMOUNT } from "./config";    // ← 추가


import {
  RPC_ENDPOINT,
  POOL_LIST_PATH,
  ROUTE_JSON_PATH,
  ARBITRAGE_THRESHOLD,
  MIN_OPTIMAL_BUY_SOL,
  MAX_OPTIMAL_BUY_SOL,
  EXPECTED_TOKEN_MULTIPLIER,
} from './config';


// ────────────────────────────────────────────────────────────
// 1. 프로그램 시작: 한번 fetchPools, 이후 5시간마다 갱신
// ────────────────────────────────────────────────────────────
(async () => {
  try {
    await fetchPools();
  } catch (e) {
    console.error("[fetchPools 초기]", e);
  }
  setInterval(async () => {
    try {
      await fetchPools();
    } catch (e) {
      console.error("[fetchPools 반복]", e);
    }
  }, 1 * 60 * 60 * 1000); // 5시간
})();

// 로그 파일 준비
const startTimestamp = getKSTTimestamp().replace(/[: ]/g, '_');
const LOG_PATH = path.resolve(__dirname, `../logs/arb-${startTimestamp}.log`);
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
fs.appendFileSync(LOG_PATH, `${getKSTTimestamp()} 프로그램 시작\n`);

// ────────────────────────────────────────────────────────────
// main 함수
// ────────────────────────────────────────────────────────────
export async function main(): Promise<void> {
  // 1) HTTP 및 WS Connection 생성
  const httpConnection = new Connection(RPC_ENDPOINT, 'confirmed');

  // 2) PriceMonitor 초기화
  const priceMonitor = new PriceMonitor(ARBITRAGE_THRESHOLD);
  let arbCounter = 0;

  // 3) 상태 저장용 Map들
  const lastPrices = new Map<string, { buy: number; sell: number }>();
  const priceHistories = new Map<string,{ sumBuy: number; sumSell: number; count: number }>();
  const loggedArbitragePaths = new Map<string, { timestamp: number; lastDifference: number }>();

  // 풀 정보 타입
  interface PoolInfo {
    pool_id: string;
    dex_name: string;
    pair?: string;
    mint?: string;
    tvl?: number;
  }

  // 4) pool list 읽기
  const poolListRaw = fs.readFileSync(POOL_LIST_PATH, 'utf-8');
  const poolList: PoolInfo[] = JSON.parse(poolListRaw);
  const poolMap = new Map<string, PoolInfo>();
  poolList.forEach(pool => poolMap.set(pool.pool_id, pool));

  // ────────────────────────────────────────────────────────────
  // 계정 변경 핸들러: onAccountChange 콜백에서 사용
  // ────────────────────────────────────────────────────────────
  async function handleAccountData(
    accountInfo: AccountInfo<Buffer>,
    slot: number,
    poolInfo: PoolInfo
  ): Promise<void> {
    if (!accountInfo?.data) return;

    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const poolType = poolInfo.dex_name.toLowerCase();
    let price: number;

    // 1) 디코딩
    const poolState = await decodePool(poolInfo.pool_id, poolInfo.dex_name.toLowerCase());
    if (!poolState) return;

// 2) 가격 계산
let buyPrice: number;
let sellPrice: number;

if (poolType === 'v4') {
  // AmmV4PriceInfo { spotPrice, buyPrice, sellPrice } 반환
  const { buyPrice: bp, sellPrice: sp } = await calculateAmmV4Prices(
    httpConnection,
    new PublicKey(poolInfo.pool_id),
    'processed'
  );
  buyPrice  = bp;
  sellPrice = sp;

} else if (poolType === 'cpmm') {
  const { buyPrice: bp, sellPrice: sp } = await calculateCpmmPrices(
    httpConnection,
    new PublicKey(poolInfo.pool_id),
    'processed'
  );
  buyPrice  = bp;
  sellPrice = sp;

} else if (poolType === 'clmm') {
  const { buyPrice: bp, sellPrice: sp } = await calculateClmmPrices(
    httpConnection,
    new PublicKey(poolInfo.pool_id),
    'processed'
  );
  buyPrice  = bp;
  sellPrice = sp;

} else if (poolType === 'dlmm') {
  // DLMM 전용 계산기 호출
  const { buyPrice: bp, sellPrice: sp } = await calculateDlmmPrices(
    httpConnection,
    new PublicKey(poolInfo.pool_id)
  );
  buyPrice  = bp;
  sellPrice = sp;

} else {
  console.error(`Unknown pool type: ${poolType}`);
  return;
}

const key       = poolInfo.pool_id;
const fixedBuy  = Number(buyPrice.toFixed(10));
const fixedSell = Number(sellPrice.toFixed(10));

const last = lastPrices.get(key);
if (last?.buy === fixedBuy && last?.sell === fixedSell) {
  return; // 변화 없으면 스킵
}
lastPrices.set(key, { buy: fixedBuy, sell: fixedSell });

const hist = priceHistories.get(key) || { sumBuy: 0, sumSell: 0, count: 0 };
hist.sumBuy  += fixedBuy;
hist.sumSell += fixedSell;
hist.count   += 1;
priceHistories.set(key, hist);

console.log(
  `[${getKSTTimestamp()}] [${poolInfo.dex_name.toUpperCase()}] [${key}] [${poolInfo.pair}] ` +
  `buy=${fixedBuy}, sell=${fixedSell} [slot=${slot}]`
);

// 4) PriceMonitor에 전달
priceMonitor.handlePrice({
  poolId:    key,
  tokenMint: poolInfo.mint || '',
  buyPrice:  fixedBuy,
  sellPrice: fixedSell,
  liquidity: poolInfo.tvl || 0,
});
}

  // ────────────────────────────────────────────────────────────
  // 0) 초기 가격 조회 (빈 데이터로 호출)
  // ────────────────────────────────────────────────────────────
  console.log('>>> 초기 가격 조회 시작...');
  for (const pool of poolList) {
    // slot=0, data=빈 Buffer
    await handleAccountData(
      { data: Buffer.alloc(0), executable: false, lamports: 0, owner: null, rentEpoch: 0 } as any,
      0,
      pool
    );
  }
  console.log('>>> 초기 가격 조회 완료.');

  // for (const pool of poolList) {
  //   const pubkey = new PublicKey(pool.pool_id);
  //   httpConnection.onAccountChange(pubkey, async (info, ctx) => {
  //     try {
  //       await handleAccountData(info, ctx.slot, pool);
  //     } catch (e) {
  //       console.error('[onAccountChange 오류]', e);
  //       // TODO: add retry or alert
  //     }
  //   });
  // }
  // helper: ms만큼 대기
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 5) 폴링 루프: 1초마다 poolList 전부 조회
async function startPolling() {
  while (true) {
    const cycleStart = Date.now();

    await Promise.all(
      poolList.map(async pool => {
        const pubkey = new PublicKey(pool.pool_id);
        try {
          const info = await httpConnection.getAccountInfo(pubkey, 'processed');
          if (info) {
            await handleAccountData(info, cycleStart, pool);
          }
        } catch (err) {
          console.error(`[poll][${pool.pool_id}] 오류:`, err);
        }
      })
    );

    // 1초 주기 맞추기
    const elapsed = Date.now() - cycleStart;
    await delay(Math.max(0, 500 - elapsed));
  }
}

// main() 끝부분에 폴링 시작 호출
startPolling().catch(e => console.error('폴링 루프 실패:', e));

  // ────────────────────────────────────────────────────────────
  // 6) Arbitrage 이벤트 처리
  // ────────────────────────────────────────────────────────────
  priceMonitor.on('arbitrage', async (op: ArbitrageOpportunity) => {
    // op.buyPool / op.sellPool 과 op.buyPrice / op.sellPrice 를 사용
    const routeKey = `${op.buyPool}-${op.sellPool}`;
    const now      = Date.now();
    const prev     = loggedArbitragePaths.get(routeKey);
    if (prev && now - prev.timestamp < 10000 && op.difference <= prev.lastDifference) {
      return;
    }
    loggedArbitragePaths.set(routeKey, { timestamp: now, lastDifference: op.difference });
  
    arbCounter += 1;
    const arbId = arbCounter;
  
    const buyPool  = poolMap.get(op.buyPool)!;
    const sellPool = poolMap.get(op.sellPool)!;
  
    // 로그 작성
    const logLines = [
      `${getKSTTimestamp()} 기회 ${arbId} 포착:`,
      `  pair: ${buyPool.pair}`,
      `  diff: ${op.difference.toFixed(6)}`,
      `  buy  [${buyPool.dex_name}] ${buyPool.pool_id} @ ${op.buyPrice.toFixed(12)}`,
      `  sell [${sellPool.dex_name}] ${sellPool.pool_id} @ ${op.sellPrice.toFixed(12)}`,
      ``,
    ];
    fs.appendFileSync(LOG_PATH, logLines.join('\n') + '\n');
  

    // 6.2) routeData 구성
    const routeData: RouteData = {
      name: buyPool.pair || "Unknown Pair",
      diff: op.difference.toFixed(2),
      buy: {
        buy_type: buyPool.dex_name.toUpperCase(),
        buyPrice:  op.buyPrice.toFixed(12),    // ← 변경
        buypool_id: buyPool.pool_id,
        buytvl:     buyPool.tvl || 0,
      },
      sell: {
        sell_type:  sellPool.dex_name.toLowerCase(),
        sellPrice: op.sellPrice.toFixed(12),   // ← 변경
        sellpool_id: sellPool.pool_id,
        selltvl:    (sellPool.tvl || 0).toString(),
      },
      optimalBuySol:   0,
      expectedBuyToken: 0,
    };

    // --- 1) Buy 풀 디코딩 ---
    let buyState: any = null;
    if (buyPool.dex_name.toLowerCase() === 'v4') {
      buyState = await decodePool(buyPool.pool_id, 'v4');
      if (buyState) {
        routeData.buy.poolId       = buyState.poolid     || buyPool.pool_id;
        routeData.buy.baseMint     = buyState.baseMint;
        routeData.buy.quoteMint    = buyState.quoteMint;
        routeData.buy.baseVault    = buyState.baseVault;
        routeData.buy.quoteVault   = buyState.quoteVault;
        routeData.buy.openOrders   = buyState.openOrders;
        routeData.buy.targetOrders = buyState.targetOrders;
        routeData.buy.baseDecimal  = buyState.baseDecimal;
        routeData.buy.quoteDecimal = buyState.quoteDecimal;
      }
    } else if (buyPool.dex_name.toLowerCase() === 'cpmm') {
      buyState = await decodePool(buyPool.pool_id, 'cpmm');
      if (buyState) {
        routeData.buy.poolId         = buyState.poolid     || buyPool.pool_id;
        routeData.buy.token0Mint     = buyState.token0Mint;
        routeData.buy.token1Mint     = buyState.token1Mint;
        routeData.buy.token0Vault    = buyState.token0Vault;
        routeData.buy.token1Vault    = buyState.token1Vault;
        routeData.buy.AmmConfig      = buyState.AmmConfig;
        routeData.buy.ObservationKey = buyState.ObservationKey;
      }
    } else if (buyPool.dex_name.toLowerCase() === 'clmm') {
      buyState = await decodePool(buyPool.pool_id, 'clmm');
      if (buyState) {
        routeData.buy.poolId             = buyState.poolId   || buyPool.pool_id;
        routeData.buy.bump               = buyState.bump;
        routeData.buy.ammConfig          = buyState.ammConfig;
        routeData.buy.owner              = buyState.owner;
        routeData.buy.tokenMint0         = buyState.tokenMint0;
        routeData.buy.tokenMint1         = buyState.tokenMint1;
        routeData.buy.tokenVault0        = buyState.tokenVault0;
        routeData.buy.tokenVault1        = buyState.tokenVault1;
        routeData.buy.observationKey     = buyState.observationKey;
        routeData.buy.mintDecimals0      = buyState.mintDecimals0;
        routeData.buy.mintDecimals1      = buyState.mintDecimals1;
        routeData.buy.tickSpacing        = buyState.tickSpacing;
        routeData.buy.tickCurrent        = buyState.tickCurrent;
        routeData.buy.status             = buyState.status;
        if (buyState.tickArrayBitmap) {
          routeData.buy.tickArrayBitmap = buyState.tickArrayBitmap.toString();
        }
        if (buyState.currentTickArray) {
          routeData.buy.currentTickArray     = buyState.currentTickArray;
          routeData.buy.previousTickArray    = buyState.previousTickArray;
          routeData.buy.prepreviousTickArray = buyState.prepreviousTickArray;
          routeData.buy.nextTickArray        = buyState.nextTickArray;
          routeData.buy.nextnextTickArray    = buyState.nextnextTickArray;
        }
      }
    } else if (buyPool.dex_name.toLowerCase() === 'dlmm') {
      buyState = await decodePool(buyPool.pool_id, 'dlmm');
      if (buyState) {
        routeData.buy.poolId      = buyState.poolId      || buyPool.pool_id;
        routeData.buy.tokenXMint  = buyState.token_x_mint || buyState.tokenXMint;
        routeData.buy.tokenYMint  = buyState.token_y_mint || buyState.tokenYMint;
        routeData.buy.reserveX    = buyState.reserve_x   || buyState.reserveX;
        routeData.buy.reserveY    = buyState.reserve_y   || buyState.reserveY;
        routeData.buy.oracle      = buyState.oracle;
        routeData.buy.BinArray1   = buyState.BinArray1;
        routeData.buy.BinArray2   = buyState.BinArray2;
        routeData.buy.BinArray3   = buyState.BinArray3;
      }
    //} else if (buyPool.dex_name.toLowerCase() === 'orca') {
    //  buyState = await decodePool(buyPool.pool_id, 'orca');
    //  if (buyState) {
    //    routeData.buy.poolId         = buyState.poolId   || buyPool.pool_id;
    //    routeData.buy.tokenMintA     = buyState.tokenMintA;
    //   routeData.buy.tokenMintB     = buyState.tokenMintB;
    //    routeData.buy.tokenVaultB    = buyState.tokenVaultB;
    //    routeData.buy.token1Vault    = buyState.token1Vault;
    //    routeData.buy.OrcatickSpacing = buyState.OrcatickSpacing;
    //    routeData.buy.tickCurrentIndex = buyState.tickCurrentIndex;
    //    routeData.buy.tickarray_2 = buyState.tickarray_2;
    //    routeData.buy.tickarray_1 = buyState.tickarray_1;
    //    routeData.buy.tickarray0 = buyState.tickarray0;
    //    routeData.buy.tickarray1 = buyState.tickarray1;
    //    routeData.buy.tickarray2 = buyState.tickarray2;
    //    routeData.buy.oracleAddress = buyState.oracleAddress;
    //}

     }
    // --- 2) Sell 풀 디코딩 ---
    let sellState: any = null;
    if (sellPool.dex_name.toLowerCase() === 'v4') {
      sellState = await decodePool(sellPool.pool_id, 'v4');
      if (sellState) {
        routeData.sell.poolId       = sellState.poolid     || sellPool.pool_id;
        routeData.sell.baseMint     = sellState.baseMint;
        routeData.sell.quoteMint    = sellState.quoteMint;
        routeData.sell.baseVault    = sellState.baseVault;
        routeData.sell.quoteVault   = sellState.quoteVault;
        routeData.sell.openOrders   = sellState.openOrders;
        routeData.sell.targetOrders = sellState.targetOrders;
        routeData.sell.baseDecimal  = sellState.baseDecimal;
        routeData.sell.quoteDecimal = sellState.quoteDecimal;
      }
    } else if (sellPool.dex_name.toLowerCase() === 'cpmm') {
      sellState = await decodePool(sellPool.pool_id, 'cpmm');
      if (sellState) {
        routeData.sell.poolId         = sellState.poolid     || sellPool.pool_id;
        routeData.sell.token0Mint     = sellState.token0Mint;
        routeData.sell.token1Mint     = sellState.token1Mint;
        routeData.sell.token0Vault    = sellState.token0Vault;
        routeData.sell.token1Vault    = sellState.token1Vault;
        routeData.sell.AmmConfig      = sellState.AmmConfig;
        routeData.sell.ObservationKey = sellState.ObservationKey;
      }
    } else if (sellPool.dex_name.toLowerCase() === 'clmm') {
      sellState = await decodePool(sellPool.pool_id, 'clmm');
      if (sellState) {
        routeData.sell.poolId             = sellState.poolId   || sellPool.pool_id;
        routeData.sell.bump               = sellState.bump;
        routeData.sell.ammConfig          = sellState.ammConfig;
        routeData.sell.owner              = sellState.owner;
        routeData.sell.tokenMint0         = sellState.tokenMint0;
        routeData.sell.tokenMint1         = sellState.tokenMint1;
        routeData.sell.tokenVault0        = sellState.tokenVault0;
        routeData.sell.tokenVault1        = sellState.tokenVault1;
        routeData.sell.observationKey     = sellState.observationKey;
        routeData.sell.mintDecimals0      = sellState.mintDecimals0;
        routeData.sell.mintDecimals1      = sellState.mintDecimals1;
        routeData.sell.tickSpacing        = sellState.tickSpacing;
        routeData.sell.tickCurrent        = sellState.tickCurrent;
        routeData.sell.status             = sellState.status;
        if (sellState.tickArrayBitmap) {
          routeData.sell.tickArrayBitmap = sellState.tickArrayBitmap.toString();
        }
        if (sellState.currentTickArray) {
          routeData.sell.currentTickArray     = sellState.currentTickArray;
          routeData.sell.previousTickArray    = sellState.previousTickArray;
          routeData.sell.prepreviousTickArray = sellState.prepreviousTickArray;
          routeData.sell.nextTickArray        = sellState.nextTickArray;
          routeData.sell.nextnextTickArray    = sellState.nextnextTickArray;
          routeData.sell.exBitmapAccount      = sellState.exBitmapAccount;
        }}
    } else if (sellPool.dex_name.toLowerCase() === 'dlmm') {
      sellState = await decodePool(sellPool.pool_id, 'dlmm');
      if (sellState) {
        routeData.sell.poolId      = sellState.poolId      || sellPool.pool_id;
        routeData.sell.tokenXMint  = sellState.token_x_mint || sellState.tokenXMint;
        routeData.sell.tokenYMint  = sellState.token_y_mint || sellState.tokenYMint;
        routeData.sell.reserveX    = sellState.reserve_x   || sellState.reserveX;
        routeData.sell.reserveY    = sellState.reserve_y   || sellState.reserveY;
        routeData.sell.oracle      = sellState.oracle;
        routeData.sell.BinArray1   = sellState.BinArray1;
        routeData.sell.BinArray2   = sellState.BinArray2;
        routeData.sell.BinArray3   = sellState.BinArray3;
      }
   // } else if (sellPool.dex_name.toLowerCase() === 'orca') {
   //   sellState = await decodePool(sellPool.pool_id, 'orca');
   //   if (sellState) {
   //     routeData.sell.poolId         = sellState.poolId   || sellPool.pool_id;
   //     routeData.sell.tokenMintA     = sellState.tokenMintA;
   //     routeData.sell.tokenMintB     = sellState.tokenMintB;
   //     routeData.sell.tokenVaultB    = sellState.tokenVaultB;
   //     routeData.sell.token1Vault    = sellState.token1Vault;
   //     routeData.sell.OrcatickSpacing = sellState.OrcatickSpacing;
   //     routeData.sell.tickCurrentIndex = sellState.tickCurrentIndex;
   //     routeData.sell.tickarray_2 = sellState.tickarray_2;
   //     routeData.sell.tickarray_1 = sellState.tickarray_1;
   //     routeData.sell.tickarray0 = sellState.tickarray0;
   //     routeData.sell.tickarray1 = sellState.tickarray1;
   //     routeData.sell.tickarray2 = sellState.tickarray2;
   //     routeData.sell.oracleAddress = sellState.oracleAddress;

   // }
  }

    // ────────────────────────────────────────────────────────────
    // 7) optimalBuySol & expectedBuyToken 계산
    // ────────────────────────────────────────────────────────────
    try {
      // buy_price를 optimalBuySol로 직접 할당
      const buqty = PRICE_SOL_AMOUNT;
      routeData.optimalBuySol = buqty;
    } catch (err) {
      console.error("optimalBuySol 할당 오류:", err);
    }
    
    try {
      // buy_price를 expectedBuyToken으로 직접 할당
      const selltoken = parseFloat(routeData.buy.buyPrice);
      routeData.expectedBuyToken = selltoken * EXPECTED_TOKEN_MULTIPLIER;
      console.log(`예상 수령 토큰: ${routeData.expectedBuyToken}`);
    } catch (err) {
      console.error("expectedBuyToken 할당 오류:", err);
    }
    

    // ────────────────────────────────────────────────────────────
    // 8) route.json 쓰기 → TickArray & BinArray 처리
    // ────────────────────────────────────────────────────────────
    const outPath = path.resolve(ROUTE_JSON_PATH);
    fs.writeFileSync(outPath, JSON.stringify(routeData, null, 2));

    await processClmmTickArrays(ROUTE_JSON_PATH, RPC_ENDPOINT);
   // await processOrcaTickArrays(ROUTE_JSON_PATH, RPC_ENDPOINT);
    await processBinArraysDlmm(ROUTE_JSON_PATH, RPC_ENDPOINT);

    console.log('최종 route.json 작성 완료');

    // ────────────────────────────────────────────────────────────
    // 9) 스왑 트랜잭션 전송 (err.logs 출력 추가)
    // ────────────────────────────────────────────────────────────
    try {
      console.log(`🔄 [${arbId}] Sending swap transaction...`);
      const txid = await sendSwapTransaction();
      console.log(`✅ [${arbId}] Swap success: ${txid}`);
      fs.appendFileSync(
        LOG_PATH,
        `${getKSTTimestamp()} 트랜잭션 ${arbId} 성공: ${txid}\n\n`
      );
    } catch (err: any) {
      console.error(`🚨 [${arbId}] Transaction failed: ${err.message}`);
      // err.logs가 있으면 모두 출력
      if (Array.isArray(err.logs)) {
        console.error('📜 Simulation logs:');
        for (const logLine of err.logs) {
          console.error(logLine);
        }        // 로그 파일에도 기록
        const logLines = (err as SendTransactionError).logs!
          .map(l => `${getKSTTimestamp()} LOG: ${l}\n`)
          .join('');
        fs.appendFileSync(LOG_PATH, logLines);
      }
      fs.appendFileSync(
        LOG_PATH,
        `${getKSTTimestamp()} 트랜잭션 ${arbId} 실패: ${err.message}\n\n`
      );
    }
  });
}

main().catch(err => {
  console.error('Unhandled error in main:', err);
  process.exit(1);
});