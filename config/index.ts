// config/index.ts
import path from 'path';
import dotenv from 'dotenv';

// .env 파일 로드
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 환경 변수 불러오기 (필수값은 !, 기본값 제공 가능)
export const RPC_URL = process.env.RPC_ENDPOINT!;
export const ENDPOINT = process.env.ENDPOINT!;
export const TOKEN = process.env.TOKEN!;
export const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY!;

// 차익 감시 기준
export const ARBITRAGE_THRESHOLD = parseFloat(process.env.ARBITRAGE_THRESHOLD || '3');
export const EXPECTED_TOKEN_MULTIPLIER = parseFloat(process.env.EXPECTED_TOKEN_MULTIPLIER || '0.9');

// 최적 매수 SOL 범위
export const MIN_OPTIMAL_BUY_SOL = parseFloat(process.env.MIN_OPTIMAL_BUY_SOL || '0.001');
export const MAX_OPTIMAL_BUY_SOL = parseFloat(process.env.MAX_OPTIMAL_BUY_SOL || '0.01');

// 데이터 파일 경로
export const POOL_LIST_PATH = path.join(__dirname, '../data/poollist.json');
export const ROUTE_JSON_PATH = path.join(__dirname, '../data/route.json');
