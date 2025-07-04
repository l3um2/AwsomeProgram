// src/swap/buyWhirlpoolV2.ts

import { Program, BN } from '@coral-xyz/anchor';
import {
  PublicKey,
  Keypair,
  Connection,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  NATIVE_MINT,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';

export function loadWalletKey(): Keypair {
  const privateKeyBase58 = process.env.WALLET_PRIVATE_KEY;
  if (!privateKeyBase58) {
    throw new Error('환경 변수 WALLET_PRIVATE_KEY가 설정되지 않았습니다.');
  }
  return Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
}

async function createAtaIfNotExist(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey
): Promise<{ address: PublicKey; instructions: TransactionInstruction[] }> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  const info = await connection.getAccountInfo(ata);
  if (!info) {
    const ix = createAssociatedTokenAccountInstruction(owner, ata, owner, mint);
    return { address: ata, instructions: [ix] };
  }
  return { address: ata, instructions: [] };
}

// Orca Whirlpool V2 program ID (하드코딩)
const ORCA_WHIRLPOOL_PROGRAM_ID = new PublicKey(
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'
);

export interface BuyParams {
  poolInfo: any;
  solAmount: number;
  tokenAmount: number;
}

export async function createBuyWhirlpoolV2Instructions(
  program: Program,               // Anchor client for Whirlpool V2
  params: BuyParams,
  connection: Connection,
  wallet: Keypair
): Promise<TransactionInstruction[]> {
  const { poolInfo, solAmount, tokenAmount } = params;
  const { specific: orcaSpecific, mintDecimalsA } = poolInfo;
  const instructions: TransactionInstruction[] = [];

  // 1) 수량 계산 (Exact-In: SOL → tokenA)
  const inAmount = new BN(Math.floor(solAmount * 1e9).toString());
  const otherAmountThreshold = new BN(
    Math.floor(tokenAmount * 10 ** mintDecimalsA).toString()
  );
  const WSOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';

  // 2) ATA 준비 (SOL, tokenA)
  const solAtaRes = await createAtaIfNotExist(
    connection,
    wallet.publicKey,
    NATIVE_MINT
  );
  const tokenAMint = new PublicKey(orcaSpecific.tokenMintA);
  const tokenAtaRes = await createAtaIfNotExist(
    connection,
    wallet.publicKey,
    tokenAMint
  );
  if (solAtaRes.instructions.length) instructions.push(...solAtaRes.instructions);
  if (tokenAtaRes.instructions.length) instructions.push(...tokenAtaRes.instructions);


  // 4) ComputeBudget 설정
  instructions.push(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
  );

  // 5) 퍼블릭키
  const whirlpoolPubkey = new PublicKey(poolInfo.address);
  const TOKEN_PROGRAM_A = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const TOKEN_PROGRAM_B = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
  const MEMO_PROGRAM_ADDRESS = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

  // 6) SwapV2 계정 매핑
  const accounts = {
    tokenProgramA: TOKEN_PROGRAM_A,
    tokenProgramB: TOKEN_PROGRAM_B,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    tokenAuthority: wallet.publicKey,
    whirlpool: whirlpoolPubkey,
    tokenMintA: new PublicKey(poolInfo.tokenMintA),
    tokenMintB: new PublicKey(poolInfo.tokenMintB),
    tokenOwnerAccountA: tokenAtaRes.address,
    tokenVaultA: new PublicKey(orcaSpecific.tokenVaultA),
    tokenOwnerAccountB: solAtaRes.address,
    tokenVaultB: new PublicKey(orcaSpecific.tokenVaultB),
    tickArray0: new PublicKey(poolInfo.tickArray0),
    tickArray1: new PublicKey(poolInfo.tickArray1),
    tickArray2: new PublicKey(poolInfo.tickArray2),
    oracle: new PublicKey(poolInfo.oracleAddress),
  };

  const aToB = poolInfo.tokenMintA === WSOL_MINT_ADDRESS;

  // 7) SwapV2 인스트럭션 생성 (sol -> tokenA)
  const swapIx = program.instruction.swap(
    inAmount,                // u64 amount (Exact-In SOL)
    otherAmountThreshold,    // u64 otherAmountThreshold (최소 tokenA)
    new BN(0),               // u128 sqrtPriceLimit
    true,                    // bool amountSpecifiedIsInput
    aToB,                   // tokenMintA 가 sol 이면 true, 그렇지 않으면 false
    null,                    // remainingAccountsInfo
    { accounts }
  );
  instructions.push(swapIx);

  return instructions;
}
