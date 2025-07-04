// src/swap/sellClmm.ts
import {
  PublicKey,
  Keypair,
  TransactionInstruction,
  Connection,
} from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import bs58 from 'bs58';
import BN from 'bn.js';
import { ClmmInstrument } from '@raydium-io/raydium-sdk-v2';

export function loadWalletKey(): Keypair {
  const privateKeyBase58 = process.env.WALLET_PRIVATE_KEY;
  if (!privateKeyBase58) {
    throw new Error('환경 변수 WALLET_PRIVATE_KEY가 설정되지 않았습니다.');
  }
  return Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
}

function solToLamports(amount: number, decimals: number): number {
  return amount * Math.pow(10, decimals);
}

const WSOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';
const WSOL_MINT_PUBLIC_KEY = new PublicKey(WSOL_MINT_ADDRESS);

export async function createSellInstruction(
  poolInfo: any,
  route: any,
  connection: Connection,
  wallet: Keypair
): Promise<TransactionInstruction[]> {
  const instructions: TransactionInstruction[] = [];

  const sellTokenAmount = route.expectedBuyToken;
  let tokenMintForMax: PublicKey;
  if (poolInfo.tokenMint0 === WSOL_MINT_ADDRESS) {
    tokenMintForMax = new PublicKey(poolInfo.tokenMint1);
  } else if (poolInfo.tokenMint1 === WSOL_MINT_ADDRESS) {
    tokenMintForMax = new PublicKey(poolInfo.tokenMint0);
  } else {
    throw new Error('CLMM Sell: 풀 정보에 WSOL이 포함되어 있지 않습니다.');
  }
  let tokenDecimals: number;
  if (poolInfo.tokenMint0 === WSOL_MINT_ADDRESS) {
    tokenDecimals = poolInfo.mintDecimals1;
  } else if (poolInfo.tokenMint1 === WSOL_MINT_ADDRESS) {
    tokenDecimals = poolInfo.mintDecimals0;
  } else {
    throw new Error('CLMM Sell: 토큰 mint 정보를 확인할 수 없습니다.');
  }

  // ATA 생성 코드를 삭제하고, 단순히 ATA 주소를 조회하도록 변경합니다.
  const inputTokenAccount = await getAssociatedTokenAddress(tokenMintForMax, wallet.publicKey);
  const outputTokenAccount = await getAssociatedTokenAddress(WSOL_MINT_PUBLIC_KEY, wallet.publicKey);

  const lamportsValue = Math.floor(solToLamports(sellTokenAmount, tokenDecimals));
  const amountInLamports = new BN(lamportsValue.toString());
  const minAmountOut = new BN(0);

  const poolId = new PublicKey(poolInfo.poolId);
  const ammConfig = new PublicKey(poolInfo.ammConfig);
  const tokenVault0 = new PublicKey(poolInfo.tokenVault0);
  const tokenVault1 = new PublicKey(poolInfo.tokenVault1);
  const observationKey = new PublicKey(poolInfo.observationKey);

  // tick array 계정 설정:
  let tickArrayAccounts;
  if (poolInfo.tokenMint0 === WSOL_MINT_ADDRESS) {
    // tokenMint0이 SOL이면: current, exBitmap, next, nextnext
    tickArrayAccounts = [
      new PublicKey(poolInfo.currentTickArray),
      new PublicKey(poolInfo.exBitmapAccount),
      new PublicKey(poolInfo.nextTickArray),
  //    new PublicKey(poolInfo.nextnextTickArray),
    ];
  } else {
    // 그렇지 않으면: current, exBitmap, previous, preprevious
    tickArrayAccounts = [
      new PublicKey(poolInfo.currentTickArray),
      new PublicKey(poolInfo.exBitmapAccount),
      new PublicKey(poolInfo.previousTickArray),
  //    new PublicKey(poolInfo.prepreviousTickArray),
    ];
  }

  let inputVault: PublicKey, outputVault: PublicKey;
  if (poolInfo.tokenMint0 === WSOL_MINT_ADDRESS) {
    inputVault = tokenVault1;
    outputVault = tokenVault0;
  } else {
    inputVault = tokenVault0;
    outputVault = tokenVault1;
  }

  const swapIx = ClmmInstrument.swapInstruction(
    new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'),
    wallet.publicKey,
    poolId,
    ammConfig,
    inputTokenAccount,
    outputTokenAccount,
    inputVault,
    outputVault,
    tokenMintForMax,
    WSOL_MINT_PUBLIC_KEY,
    tickArrayAccounts,
    observationKey,
    amountInLamports,
    minAmountOut,
    new BN(0),
    true
  );
  instructions.push(swapIx);
  return instructions;
}
