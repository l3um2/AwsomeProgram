//src/config/index.ts

import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

export const RPC_ENDPOINT  = process.env.RPC_ENDPOINT!;
export const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY!;

export const POOL_LIST_PATH  = process.env.POOL_LIST_PATH  
  ? path.resolve(process.cwd(), process.env.POOL_LIST_PATH)
  : path.resolve(process.cwd(), 'data/pools.json');
export const ROUTE_JSON_PATH = process.env.ROUTE_JSON_PATH 
  ? path.resolve(process.cwd(), process.env.ROUTE_JSON_PATH)
  : path.resolve(process.cwd(), 'data/route.json');

export const ARBITRAGE_THRESHOLD       = Number(process.env.ARBITRAGE_THRESHOLD)       || 0.1;
export const MIN_OPTIMAL_BUY_SOL       = Number(process.env.MIN_OPTIMAL_BUY_SOL)       || 0.01;
export const MAX_OPTIMAL_BUY_SOL       = Number(process.env.MAX_OPTIMAL_BUY_SOL)       || 1.0;
export const EXPECTED_TOKEN_MULTIPLIER = Number(process.env.EXPECTED_TOKEN_MULTIPLIER) || 1.0;

export const PRICE_SOL_AMOUNT = 0.01;