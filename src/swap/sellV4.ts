// src/swap/sellV4.ts
import { PublicKey, Keypair, TransactionInstruction, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import bs58 from 'bs58';
import BN from 'bn.js';
import * as borsh from 'borsh';

/**
 * 지갑 로드 함수
 */
export function loadWalletKey(): Keypair {
  const privateKeyBase58 = process.env.WALLET_PRIVATE_KEY;
  if (!privateKeyBase58) {
    throw new Error('환경 변수 WALLET_PRIVATE_KEY가 설정되지 않았습니다.');
  }
  return Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
}

/**
 * sellV4 스왑 인스트럭션 생성
 * - route.expectedBuyToken 값을 판매할 토큰(amountIn)으로, 
 */
export async function createSellInstruction(
  poolData: any,
  route: any,
  connection: Connection,
  wallet: Keypair
): Promise<TransactionInstruction[]> {
  const instructions: TransactionInstruction[] = [];

  // 입력(판매할 토큰) 및 출력(받을 SOL)의 원래 수량
  const sellTokenAmount = route.expectedBuyToken;
  const buyTokenAmount = 0;

  // WSOL mint 주소 (출력 토큰)
  const WSOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';

  // 동적으로 token amount를 lamports 단위 정수로 변환하는 함수
  function tokenToLamports(amount: number, decimals: number): number {
    return amount * Math.pow(10, decimals);
  }

  // 판매할 토큰은 WSOL이 아닌 쪽 mint가 됩니다.
  let inputMint: string, outputMint: string;
  const baseMint = poolData.baseMint;
  const quoteMint = poolData.quoteMint;
  if (baseMint === WSOL_MINT_ADDRESS) {
    inputMint = quoteMint;
    outputMint = WSOL_MINT_ADDRESS;
  } else if (quoteMint === WSOL_MINT_ADDRESS) {
    inputMint = baseMint;
    outputMint = WSOL_MINT_ADDRESS;
  } else {
    throw new Error('SellV4: 풀 정보에 WSOL이 존재하지 않습니다.');
  }
  const inputMintPubkey = new PublicKey(inputMint);
  const outputMintPubkey = new PublicKey(outputMint);

  // 사용자 ATA (Associated Token Account) 조회
  const userInputTokenAccount = await getAssociatedTokenAddress(inputMintPubkey, wallet.publicKey);
  const userOutputTokenAccount = await getAssociatedTokenAddress(outputMintPubkey, wallet.publicKey);

  // 판매할 토큰의 decimal 결정 (입력 토큰)
  let tokenDecimals: number;
  if (baseMint === WSOL_MINT_ADDRESS) {
    // baseMint가 WSOL이면 판매할 토큰은 quote token
    tokenDecimals = poolData.quoteDecimal;
  } else if (quoteMint === WSOL_MINT_ADDRESS) {
    // 반대이면 판매할 토큰은 base token
    tokenDecimals = poolData.baseDecimal;
  } else {
    throw new Error('SellV4: 토큰 mint 정보를 확인할 수 없습니다.');
  }
  
  // 판매할 토큰의 lamports 단위 금액 계산 (소수점 이하 제거)
  const amountInLamports = new BN(Math.floor(tokenToLamports(sellTokenAmount, tokenDecimals)).toString());
  // 출력(WSOL)은 보통 9자리이므로 WSOL의 decimal을 9로 사용하여 계산
  const minAmountOut = new BN(Math.floor(buyTokenAmount * Math.pow(10, 9)).toString());

  // V4 스왑에 필요한 풀 관련 계정들
  const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const AMM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
  const ammAuthority = new PublicKey(poolData.authority || '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');
  const amm = new PublicKey(poolData.poolid || poolData.poolId);
  const ammOpenOrders = new PublicKey(poolData.openOrders);
  const ammTargetOrders = new PublicKey(poolData.targetOrders);
  const poolCoinTokenAccount = new PublicKey(poolData.baseVault);
  const poolPcTokenAccount = new PublicKey(poolData.quoteVault);

  // V4 스왑에서, Sell인 경우 판매할 토큰(입력)과 WSOL(출력)의 vault 설정:
  let inputVault: PublicKey, outputVault: PublicKey;
  if (baseMint === WSOL_MINT_ADDRESS) {
    // WSOL이 baseMint이면, 판매할 토큰은 quote token → 입력: quote vault, 출력: base vault
    inputVault = poolPcTokenAccount;
    outputVault = poolCoinTokenAccount;
  } else {
    // WSOL이 quoteMint이면, 판매할 토큰은 base token → 입력: base vault, 출력: quote vault
    inputVault = poolCoinTokenAccount;
    outputVault = poolPcTokenAccount;
  }
  
  // borsh 직렬화로 스왑 인스트럭션 데이터 생성
  class SwapInstructionData {
    instruction: number;
    amountIn: BN;
    minimumAmountOut: BN;
    constructor(fields: { instruction: number; amountIn: BN; minimumAmountOut: BN }) {
      this.instruction = fields.instruction;
      this.amountIn = fields.amountIn;
      this.minimumAmountOut = fields.minimumAmountOut;
    }
  }
  const SwapSchema = new Map([
    [
      SwapInstructionData,
      {
        kind: 'struct',
        fields: [
          ['instruction', 'u8'],
          ['amountIn', 'u64'],
          ['minimumAmountOut', 'u64'],
        ],
      },
    ],
  ]);
  
  // V4 Sell 인스트럭션의 discriminator (기존 sell_v4.js에서는 9로 사용)
  const SWAP_INSTRUCTION_DISCRIMINATOR = 9;
  const swapData = new SwapInstructionData({
    instruction: SWAP_INSTRUCTION_DISCRIMINATOR,
    amountIn: amountInLamports,
    minimumAmountOut: minAmountOut,
  });
  const swapInstructionData = Buffer.from(borsh.serialize(SwapSchema, swapData));
  
  // Serum DEX 관련 계정 (v4 AMM 스왑 시 필요)
  const serumProgram = new PublicKey('9xQeWvG816bUx9EPf2Wz3YyzGHihqu7rTVZmVF5kpE2E');
  const serumMarket = new PublicKey(poolData.serumMarket || poolData.poolid || poolData.poolId);
  const serumBids = new PublicKey(poolData.serumBids || poolData.poolid || poolData.poolId);
  const serumAsks = new PublicKey(poolData.serumAsks || poolData.poolid || poolData.poolId);
  const serumEventQueue = new PublicKey(poolData.serumEventQueue || poolData.poolid || poolData.poolId);
  const serumCoinVaultAccount = new PublicKey(poolData.serumCoinVaultAccount || poolData.baseVault);
  const serumPcVaultAccount = new PublicKey(poolData.serumPcVaultAccount || poolData.quoteVault);
  const serumVaultSigner = new PublicKey(poolData.serumVaultSigner || poolData.poolid || poolData.poolId);
  
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
    { pubkey: userInputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userOutputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
  ];
  
  const swapInstruction = new TransactionInstruction({
    keys: swapKeys,
    programId: AMM_PROGRAM_ID,
    data: swapInstructionData,
  });
  
  instructions.push(swapInstruction);
  return instructions;
}
