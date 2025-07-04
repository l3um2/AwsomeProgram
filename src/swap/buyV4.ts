// src/swap/buyV4.ts
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
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import BN from 'bn.js';
import * as borsh from 'borsh';

// borsh 직렬화를 위한 스왑 인스트럭션 데이터 구조
export class SwapInstructionData {
  instruction: number;
  maxAmountIn: BN;
  amountOut: BN;

  constructor(fields: { instruction: number; maxAmountIn: BN; amountOut: BN }) {
    this.instruction = fields.instruction;
    this.maxAmountIn = fields.maxAmountIn;
    this.amountOut = fields.amountOut;
  }
}

export const SwapSchema = new Map([
  [
    SwapInstructionData,
    {
      kind: 'struct',
      fields: [
        ['instruction', 'u8'],
        ['maxAmountIn', 'u64'],
        ['amountOut', 'u64'],
      ],
    },
  ],
]);

export function loadWalletKey(): Keypair {
  const privateKeyBase58 = process.env.WALLET_PRIVATE_KEY;
  if (!privateKeyBase58) {
    throw new Error('환경 변수 WALLET_PRIVATE_KEY가 설정되지 않았습니다.');
  }
  return Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
}

function solToLamports(sol: number): number {
  return sol * 1e9;
}

// tokenDecimals를 적용하여 토큰의 최소단위 수량으로 변환하는 함수
function tokenToSmallestUnit(amount: number, decimals: number): number {
  return Math.floor(amount * Math.pow(10, decimals));
}

const WSOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';

/**
 * ATA(account) 가 없으면 생성하는 인스트럭션을 반환합니다.
 */
async function createAtaIfNotExist(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey
): Promise<{ address: PublicKey; instructions: TransactionInstruction[] }> {
  const ata = await getAssociatedTokenAddress(mint, payer.publicKey);
  const info = await connection.getAccountInfo(ata);
  if (!info) {
    const ix = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      payer.publicKey,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return { address: ata, instructions: [ix] };
  }
  return { address: ata, instructions: [] };
}

export async function createBuyInstruction(
  poolData: any,
  route: any,
  connection: Connection,
  wallet: Keypair
): Promise<TransactionInstruction[]> {
  const instructions: TransactionInstruction[] = [];

  // 1) Buy 시 사용할 SOL 수량 설정  
  const buysol = route.optimalBuySol;
  const maxAmountIn = new BN(solToLamports(buysol).toString());

  // 2) tokenDecimals 결정
  let tokenDecimals: number;
  if (poolData.baseMint === WSOL_MINT_ADDRESS) {
    tokenDecimals = poolData.quoteDecimal;
  } else if (poolData.quoteMint === WSOL_MINT_ADDRESS) {
    tokenDecimals = poolData.baseDecimal;
  } else {
    throw new Error('V4 Buy: 풀 정보에 WSOL이 포함되어 있지 않습니다.');
  }

  // 3) 예상 받을 토큰 수량 → BN
  const rawExpectedBuyToken = route.expectedBuyToken;
  const tokenAmountOut = tokenToSmallestUnit(rawExpectedBuyToken, tokenDecimals);
  const amountOut = new BN(tokenAmountOut.toString());

  // 4) ComputeBudget 인스트럭션
  instructions.push(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 152228 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
  );

  // 5) 입력/출력 MINT 결정
  const inputMint = new PublicKey(WSOL_MINT_ADDRESS);
  const outputMint = new PublicKey(
    poolData.baseMint === WSOL_MINT_ADDRESS ? poolData.quoteMint : poolData.baseMint
  );

  // 6) 사용자 ATA 조회/생성
  const inputAtaResult = await createAtaIfNotExist(connection, wallet, inputMint);
  const outputAtaResult = await createAtaIfNotExist(connection, wallet, outputMint);
  if (inputAtaResult.instructions.length) instructions.push(...inputAtaResult.instructions);
  if (outputAtaResult.instructions.length) instructions.push(...outputAtaResult.instructions);

  // 7) borsh 직렬화된 스왑 데이터 생성
  const swapDataObj = new SwapInstructionData({
    instruction: 11,
    maxAmountIn,
    amountOut,
  });
  const swapDataBuffer = Buffer.from(borsh.serialize(SwapSchema, swapDataObj));

  // 8) V4 풀 관련 계정 세팅
  const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const AMM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
  const ammAuthority = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');
  const amm = new PublicKey(poolData.poolId);
  const ammOpenOrders = new PublicKey(poolData.openOrders);
  const ammTargetOrders = new PublicKey(poolData.targetOrders);
  const poolCoinTokenAccount = new PublicKey(poolData.baseVault);
  const poolPcTokenAccount = new PublicKey(poolData.quoteVault);

  // Serum DEX 관련 계정 (v4 AMM 스왑 시 필요)
  const serumProgram = new PublicKey('9xQeWvG816bUx9EPf2Wz3YyzGHihqu7rTVZmVF5kpE2E');
  const serumMarket = new PublicKey(poolData.poolId);
  const serumBids = new PublicKey(poolData.poolId);
  const serumAsks = new PublicKey(poolData.poolId);
  const serumEventQueue = new PublicKey(poolData.poolId);
  const serumCoinVaultAccount = new PublicKey(poolData.baseVault);
  const serumPcVaultAccount = new PublicKey(poolData.quoteVault);
  const serumVaultSigner = new PublicKey(poolData.poolId);

  // 9) Swap 인스트럭션 키 배열
  const swapKeys = [
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: amm, isSigner: false, isWritable: true },
    { pubkey: ammAuthority, isSigner: false, isWritable: false },
    { pubkey: ammOpenOrders, isSigner: false, isWritable: true },
    { pubkey: ammTargetOrders, isSigner: false, isWritable: true },
    { pubkey: poolCoinTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolPcTokenAccount, isSigner: false, isWritable: true },
    { pubkey: serumProgram, isSigner: false, isWritable: false },
    { pubkey: serumMarket, isSigner: false, isWritable: true },
    { pubkey: serumBids, isSigner: false, isWritable: true },
    { pubkey: serumAsks, isSigner: false, isWritable: true },
    { pubkey: serumEventQueue, isSigner: false, isWritable: true },
    { pubkey: serumCoinVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumPcVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumVaultSigner, isSigner: false, isWritable: false },
    { pubkey: inputAtaResult.address, isSigner: false, isWritable: true },
    { pubkey: outputAtaResult.address, isSigner: false, isWritable: true },
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
  ];

  // 10) 스왑 인스트럭션 생성 및 추가
  const swapIx = new TransactionInstruction({
    keys: swapKeys,
    programId: AMM_PROGRAM_ID,
    data: swapDataBuffer,
  });
  instructions.push(swapIx);

  return instructions;
}
