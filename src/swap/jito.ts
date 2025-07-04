// src/swap/jito.ts
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

import {
  loadWalletKey as loadWalletKeyBuyClmm,
  createBuyInstruction as createBuyClmmInstruction,
} from './buyClmm';
import {
  loadWalletKey as loadWalletKeyBuyV4,
  createBuyInstruction as createBuyV4Instruction,
} from './buyV4';
import {
  loadWalletKey as loadWalletKeyBuyDlmm,
  createBuyInstruction as createBuyDlmmInstruction,
} from './buyDlmm';
import {
  loadWalletKey as loadWalletKeyBuyCpmm,
  createBuyInstruction as createBuyCpmmInstruction,
} from './buyCpmm';
//import {
//  loadWalletKey as loadWalletKeyBuyDym,
//  createBuyInstruction as createBuyDymInstruction,
//} from './buyOrca';


import {
  loadWalletKey as loadWalletKeySellClmm,
  createSellInstruction as createSellClmmInstruction,
} from './sellClmm';
import {
  loadWalletKey as loadWalletKeySellV4,
  createSellInstruction as createSellV4Instruction,
} from './sellV4';
import {
  loadWalletKey as loadWalletKeySellDlmm,
  createSellInstruction as createSellDlmmInstruction,
} from './sellDlmm';
import {
  loadWalletKey as loadWalletKeySellCpmm,
  createSellInstruction as createSellCpmmInstruction,
} from './sellCpmm';
import {
  loadWalletKey as loadWalletKeySellDym,
  createSellInstruction as createSellDymInstruction,
} from './sellCpmm';


import { getKSTTimestamp } from '../utils/time';
import { RPC_ENDPOINT, ROUTE_JSON_PATH } from '../config';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 로그 디렉터리 및 파일 준비
const LOG_DIR = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(
  LOG_DIR,
  `arb-${getKSTTimestamp().replace(/[: ]/g, '_')}.log`
);
function logFile(msg: string) {
  fs.appendFileSync(LOG_FILE, msg + '\n');
}

// SOL → 팁 전송 인스트럭션 생성
function createTipInstruction(
  tipAccount: string,
  walletPubkey: PublicKey,
  tipAmountLamports: number
): TransactionInstruction {
  return SystemProgram.transfer({
    fromPubkey: walletPubkey,
    toPubkey: new PublicKey(tipAccount),
    lamports: tipAmountLamports,
  });
}

export async function sendSwapTransaction(): Promise<void> {
  try {
    // 1) RPC 연결
    if (!RPC_ENDPOINT) throw new Error('환경 변수 RPC_ENDPOINT가 설정되지 않았습니다.');
    const connection = new Connection(RPC_ENDPOINT, 'processed');

    // 2) 지갑 로드
    const wallet = loadWalletKeyBuyClmm();

    // 3) route.json 경로 계산 & 읽기
    const routeFilePath = path.resolve(process.cwd(), ROUTE_JSON_PATH);
    logFile(`[${getKSTTimestamp()}] 읽는 route.json 경로: ${routeFilePath}`);
    const raw = fs.readFileSync(routeFilePath, 'utf-8');
    logFile(`[${getKSTTimestamp()}] raw route.json: ${raw}`);
    const route: any = JSON.parse(raw);
    logFile(`[${getKSTTimestamp()}] parsed routeData: ${JSON.stringify(route)}`);

    // 4) 필수 필드 방어
    if (route.optimalBuySol == null)  throw new Error('optimalBuySol 값이 없습니다!');
    if (route.expectedBuyToken == null) throw new Error('expectedBuyToken 값이 없습니다!');

    // 5) 트랜잭션 생성
    const instructions: TransactionInstruction[] = [];

    // 5.1) 팁
    const tipIx = createTipInstruction('ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49', wallet.publicKey, 10566);
    instructions.push(tipIx);

    // 5.2) Buy
    const buyType = route.buy.buy_type.toUpperCase();
    logFile(`[${getKSTTimestamp()}] Buy 타입: ${buyType}`);
    if      (buyType === 'V4')   instructions.push(...await createBuyV4Instruction(route.buy, route, connection, wallet));
    else if (buyType === 'CLMM') instructions.push(...await createBuyClmmInstruction(route.buy, route, connection, wallet));
    else if (buyType === 'DLMM') instructions.push(...await createBuyDlmmInstruction(route.buy, route, connection, wallet));
    else if (buyType === 'CPMM') instructions.push(...await createBuyCpmmInstruction(route.buy, route, connection, wallet));
    //else if (buyType === 'DYM') instructions.push(...await createBuyDymInstruction(route.buy, route, connection, wallet));

    else logFile(`[${getKSTTimestamp()}] 알 수 없는 buy_type: ${buyType}`);

    // 5.3) Sell
    const sellType = route.sell.sell_type.toUpperCase();
    logFile(`[${getKSTTimestamp()}] Sell 타입: ${sellType}`);
    if      (sellType === 'V4')   instructions.push(...await createSellV4Instruction(route.sell, route, connection, wallet));
    else if (sellType === 'CLMM') instructions.push(...await createSellClmmInstruction(route.sell, route, connection, wallet));
    else if (sellType === 'DLMM') instructions.push(...await createSellDlmmInstruction(route.sell, route, connection, wallet));
    else if (sellType === 'CPMM') instructions.push(...await createSellCpmmInstruction(route.sell, route, connection, wallet));
    //else if (sellType === 'DYM') instructions.push(...await createSellDymInstruction(route.sell, route, connection, wallet));
    else logFile(`[${getKSTTimestamp()}] 알 수 없는 sell_type: ${sellType}`);

    // 6) 조립·서명·전송
    const tx = new Transaction({ feePayer: wallet.publicKey });
    tx.add(...instructions);
    tx.recentBlockhash = (await connection.getLatestBlockhash('processed')).blockhash;

    logFile(`[${getKSTTimestamp()}] 트랜잭션 전송 시도`);
    const sig = await sendAndConfirmTransaction(connection, tx, [wallet], { commitment: 'processed' });
    console.log(`💰 트랜잭션 전송 성공: ${sig}`);
    logFile(`[${getKSTTimestamp()}] 트랜잭션 성공: ${sig}`);
  } catch (err: any) {
    console.error(`❌에러 발생:❌ ${err.message}`);
    logFile(`[${getKSTTimestamp()}] 트랜잭션 실패: ${err.message}`);
  }
}
