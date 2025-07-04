// src/swap/buyCpmm.ts
import {
  PublicKey,
  Keypair,
  ComputeBudgetProgram,
  TransactionInstruction,
  Connection,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import BN from 'bn.js';

import { makeSwapCpmmBaseOutInstruction } from '@raydium-io/raydium-sdk-v2';

// SOL 및 토큰 단위를 lamports 단위로 변환하는 헬퍼 함수들
function solToLamports(sol: number): number {
  return sol * 1e9;
}
function tokenToLamports(token: number): number {
  return token * 1e6;
}

// 지갑 키 로드
export function loadWalletKey(): Keypair {
  const privateKeyBase58 = process.env.WALLET_PRIVATE_KEY;
  if (!privateKeyBase58) {
    throw new Error('환경 변수 WALLET_PRIVATE_KEY가 설정되지 않았습니다.');
  }
  return Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
}

/**
 * ATA가 존재하지 않을 경우 생성 인스트럭션을 반환하는 함수
 */
async function createAtaIfNotExist(
  connection: Connection,
  walletPubkey: PublicKey,
  mint: PublicKey
): Promise<{ address: PublicKey; instructions: TransactionInstruction[] }> {
  const ata = await getAssociatedTokenAddress(mint, walletPubkey);
  const accountInfo = await connection.getAccountInfo(ata);
  if (!accountInfo) {
    const createIx = createAssociatedTokenAccountInstruction(
      walletPubkey,
      ata,
      walletPubkey,
      mint
    );
    return { address: ata, instructions: [createIx] };
  }
  return { address: ata, instructions: [] };
}

const WSOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';

export async function createBuyInstruction(
  poolData: any,
  route: any,
  connection: Connection,
  wallet: Keypair
): Promise<TransactionInstruction[]> {
  const instructions: TransactionInstruction[] = [];

  // 1. Buy 시 사용하는 SOL (입력) 및 예상 TOKEN (출력) 수량 설정
  const buysol = route.optimalBuySol;
  // 소수점 이하를 제거하여 정수값을 BN으로 생성 (예: 0.0034328409482551783 SOL -> lamports)
  const maxAmountIn = new BN(Math.floor(solToLamports(buysol)).toString());

  const sellTokenAmount = route.expectedBuyToken;
  const amountOut = new BN(Math.floor(tokenToLamports(sellTokenAmount)).toString());

  // 2. ComputeBudget 인스트럭션 추가 (Buy 경우에만)
  const computeUnitLimitRequest = ComputeBudgetProgram.setComputeUnitLimit({ units: 152228 });
  const priorityFeeRequest = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 });
  instructions.push(computeUnitLimitRequest, priorityFeeRequest);

  // 3. 입력/출력 MINT 설정: Buy는 입력이 WSOL, 출력이 풀의 다른 토큰
  const baseMint = poolData.token0Mint;
  const quoteMint = poolData.token1Mint;
  const inputMint = WSOL_MINT_ADDRESS; // 고정 WSOL
  const outputMint = baseMint === WSOL_MINT_ADDRESS ? quoteMint : baseMint;
  const inputMintPubkey = new PublicKey(inputMint);
  const outputMintPubkey = new PublicKey(outputMint);

  // 4. 사용자 ATA 생성 (없으면 생성 인스트럭션 추가)
  const inputAtaResult = await createAtaIfNotExist(connection, wallet.publicKey, inputMintPubkey);
  const outputAtaResult = await createAtaIfNotExist(connection, wallet.publicKey, outputMintPubkey);
  if (inputAtaResult.instructions.length > 0) instructions.push(...inputAtaResult.instructions);
  if (outputAtaResult.instructions.length > 0) instructions.push(...outputAtaResult.instructions);

  // 5. Raydium CPMM 풀 관련 계정 정보 세팅
  const payer = wallet.publicKey;
  const CPMM_PROGRAM_ID = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
  const ammAuthority = new PublicKey('GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL');
  const AmmConfig = new PublicKey(poolData.AmmConfig);
  const PoolState = new PublicKey(poolData.poolid || poolData.poolId);

  // 풀의 vault 계정 설정
  let poolCoinTokenAccount: PublicKey;
  let poolPcTokenAccount: PublicKey;
  if (baseMint === WSOL_MINT_ADDRESS) {
    poolCoinTokenAccount = new PublicKey(poolData.token0Vault);
    poolPcTokenAccount = new PublicKey(poolData.token1Vault);
  } else {
    poolCoinTokenAccount = new PublicKey(poolData.token1Vault);
    poolPcTokenAccount = new PublicKey(poolData.token0Vault);
  }

  const observationState = new PublicKey(poolData.ObservationKey);

  // 6. Raydium SDK의 스왑 함수 호출하여 인스트럭션 생성
  const swapInstruction = makeSwapCpmmBaseOutInstruction(
    CPMM_PROGRAM_ID,            // Raydium CPMM 프로그램 ID
    payer,                      // 사용자 지갑 (payer)
    ammAuthority,               // 풀의 authority
    AmmConfig,                  // AmmConfig
    PoolState,                  // 풀 상태 계정
    inputAtaResult.address,     // 사용자 입력 토큰 계정
    outputAtaResult.address,    // 사용자 출력 토큰 계정
    poolCoinTokenAccount,       // 풀의 입력 토큰 계정
    poolPcTokenAccount,         // 풀의 출력 토큰 계정
    TOKEN_PROGRAM_ID,           // 입력 SPL-Token
    TOKEN_PROGRAM_ID,           // 출력 SPL-Token
    inputMintPubkey,            // 입력 토큰 mint
    outputMintPubkey,           // 출력 토큰 mint
    observationState,           // 스왑 관찰 계정
    maxAmountIn,                // 최대 투입 양
    amountOut                   // 예상 받을 양
  );

  instructions.push(swapInstruction);
  return instructions;
}
