import axios from "axios";
import fs from "fs";
import path from "path";
import { POOL_LIST_PATH } from "../config";

// -------------------------------------------------
// API URL 및 상수 설정
// -------------------------------------------------

// Meteora (DLMM) 관련 상수
const METEORA_API = "https://dlmm-api.meteora.ag/pair/all";

// Raydium 관련 상수
const RAYDIUM_API_URL =
  "https://api-v3.raydium.io/pools/info/mint?mint1=So11111111111111111111111111111111111111112&poolType=all&poolSortField=liquidity&sortType=desc&pageSize=1000&page=";
const RAYDIUM_PROGRAMS: Record<string, string> = {
  v4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  clmm: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
  //cpmm: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
};

// Orca 관련 상수
// const ORCA_API_URL =
//   "https://api.orca.so/v2/solana/pools?sortBy=tvl&minTvl=4000&minVolume=4000&token=So11111111111111111111111111111111111111112";

// 제외할 풀 ID들이 기록된 파일
const EXEPT_FILE = path.resolve(path.dirname(POOL_LIST_PATH), "exept.json");

// -------------------------------------------------
// 유틸리티
// -------------------------------------------------
function normalizePairName(tokenA: string, tokenB: string): string {
  const a = tokenA === "SOL" ? "WSOL" : tokenA;
  const b = tokenB === "SOL" ? "WSOL" : tokenB;
  return a === "WSOL" ? `${b}/${a}` : `${a}/${b}`;
}

// -------------------------------------------------
// Meteora (DLMM) 풀 조회
// -------------------------------------------------
async function fetchMeteoraPools() {
  try {
    console.log("[fetchPools] Fetching Meteora pools...");
    const { data } = await axios.get(METEORA_API);
    const filtered = data.filter(
      (p: any) =>
        (p.mint_x.includes("So11111111111111111111111111111111111111112") ||
         p.mint_y.includes("So11111111111111111111111111111111111111112")) &&
        parseFloat(p.liquidity) >= 10000 &&
        parseFloat(p.trade_volume_24h) >= 30000
    );
    console.log(`[fetchPools] ${filtered.length} Meteora pools after filter.`);

    return filtered.map((p: any) => {
      const [A, B] = p.name.split("-");
      let mint = p.mint_x;
      if (A === "SOL" || A === "WSOL") mint = p.mint_y;
      else if (B === "SOL" || B === "WSOL") mint = p.mint_x;
      return {
        dex_name: "dlmm",
        mint,
        pool_id: p.address,
        pair: normalizePairName(A, B),
        tvl: parseFloat(p.liquidity),
      };
    });
  } catch (err: any) {
    console.error("[fetchPools] Meteora fetch failed:", err.message);
    return [];
  }
}

// -------------------------------------------------
// Raydium 풀 조회
// -------------------------------------------------
async function fetchRaydiumPools() {
  const TOTAL_PAGES = 10;
  console.log(`[fetchPools] Fetching Raydium pools (${TOTAL_PAGES} pages)...`);
  const reqs = Array.from({ length: TOTAL_PAGES }, (_, i) =>
    axios
      .get(`${RAYDIUM_API_URL}${i + 1}`)
      .then(r => r.data?.data?.data || [])
      .catch((e: any) => {
        console.error(`[fetchPools] Raydium page ${i + 1} failed:`, e.message);
        return [];
      })
  );
  const pages = (await Promise.all(reqs)).flat();
  console.log(`[fetchPools] Retrieved ${pages.length} Raydium entries.`);

  const out: any[] = [];
  for (const p of pages) {
    let type: string | null = null;
    for (const [k, pid] of Object.entries(RAYDIUM_PROGRAMS)) {
      if (p.programId === pid) {
        type = k;
        break;
      }
    }
    if (!type) continue;
    if (!p.mintA?.symbol || !p.mintB?.symbol) continue;
    if (!p.day || parseFloat(p.day.volume) < 3000) continue;

    const A = p.mintA.symbol;
    const B = p.mintB.symbol;
    const pair = normalizePairName(A, B);
    let mintAddr = p.mintA.address;
    if (A === "SOL" || A === "WSOL") mintAddr = p.mintB.address;
    else if (B === "SOL" || B === "WSOL") mintAddr = p.mintA.address;

    out.push({
      dex_name: type,
      mint: mintAddr,
      pool_id: p.id,
      pair,
      tvl: p.tvl,
    });
  }
  console.log(`[fetchPools] ${out.length} Raydium pools after filter.`);
  return out;
}

// -------------------------------------------------
// Orca 풀 조회
// -------------------------------------------------
// async function fetchOrcaPools() {
//   try {
//     console.log("[fetchPools] Fetching Orca pools...");
//     const resp = await axios.get(ORCA_API_URL);
//     const pools = resp.data?.data || [];
//     console.log(`[fetchPools] Retrieved ${pools.length} Orca entries.`);

//     return pools.map((p: any) => {
//       const A = p.tokenA.symbol;
//       const B = p.tokenB.symbol;
//       const pair = normalizePairName(A, B);
//       let mintAddr = p.tokenA.address;
//       if (A === "SOL" || A === "WSOL") mintAddr = p.tokenB.address;
//       else if (B === "SOL" || B === "WSOL") mintAddr = p.tokenA.address;

//       return {
//         dex_name: "orca",
//         mint: mintAddr,
//         pool_id: p.address,
//         pair,
//         tvl: parseFloat(p.tvlUsdc),
//       };
//     });
//   } catch (err: any) {
//     console.error("[fetchPools] Orca fetch failed:", err.message);
//     return [];
//   }
// }

// -------------------------------------------------
// 메인: 세 결과 합치고 저장
// -------------------------------------------------
export async function fetchPools() {
  console.log("[fetchPools] Start");
  const [meteora, raydium] = await Promise.all([ //orca
    fetchMeteoraPools(),
    fetchRaydiumPools(),
  //  fetchOrcaPools(),
  ]);
  let all = [...meteora, ...raydium]; //...orca
  console.log(`[fetchPools] Total before dedupe: ${all.length}`);

  // mint별로 서로 다른 dex_name(Set) 개수 구해서, 2개 이상인 mint만 남기기
  const mintDexMap: Record<string, Set<string>> = {};
  all.forEach(p => {
    if (!mintDexMap[p.mint]) mintDexMap[p.mint] = new Set();
    mintDexMap[p.mint].add(p.dex_name);
  });
  all = all.filter(p => mintDexMap[p.mint]?.size >= 2);
  console.log(`[fetchPools] After mint filter: ${all.length}`);

  let exclude: string[] = [];
  try {
    exclude = JSON.parse(fs.readFileSync(EXEPT_FILE, "utf-8"));
    console.log(`[fetchPools] Excluding ${exclude.length} pools`);
  } catch {
    console.warn("[fetchPools] No exept.json found");
  }
  const excludeSet = new Set(exclude.map(id => id.trim()));
  all = all.filter(p => !excludeSet.has(p.pool_id.toString().trim()));
  
  console.log(`[fetchPools] Final count: ${all.length}`);

  await fs.promises.mkdir(path.dirname(POOL_LIST_PATH), { recursive: true });
  fs.writeFileSync(POOL_LIST_PATH, JSON.stringify(all, null, 2), "utf-8");
  console.log(`[fetchPools] Saved ${all.length} pools to ${POOL_LIST_PATH}`);
}
