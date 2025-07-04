// src/swap/sellCpmm.ts
import { PublicKey, Keypair, TransactionInstruction, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import bs58 from 'bs58';
import BN from 'bn.js';
// Raydium SDK v2에서 sellCpmm 스왑 함수 import
import { makeSwapCpmmBaseInInstruction } from '@raydium-io/raydium-sdk-v2';

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
 * sellCpmm 스왑 인스트럭션 생성
 * - 여기서는 sell (token → SOL) 방향 스왑으로, 
 *   amountIn은 route.expectedBuyToken, amountOutMin은 0으로 설정합니다.
 */
export async function createSellInstruction(
  poolData: any,
  route: any,
  connection: Connection,
  wallet: Keypair
): Promise<TransactionInstruction[]> {
  const instructions: TransactionInstruction[] = [];


  function tokenToLamports(amount: number, decimals: number): number {
    return amount * Math.pow(10, decimals);
  }
  const WSOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';

  const amountOutMin = new BN("0");

  const sellTokenAmount = route.expectedBuyToken;
  let tokenMintForMax: PublicKey;
  if (poolData.token0Mint === WSOL_MINT_ADDRESS) {
    tokenMintForMax = new PublicKey(poolData.token1Mint);
  } else if (poolData.token1Mint === WSOL_MINT_ADDRESS) {
    tokenMintForMax = new PublicKey(poolData.token0Mint);
  } else {
    throw new Error('CPMM Sell: 풀 정보에 WSOL이 포함되어 있지 않습니다.');
  }
  let tokenDecimals: number;
  if (poolData.token0Mint === WSOL_MINT_ADDRESS) {
    tokenDecimals = poolData.mint1Decimals;
  } else if (poolData.token1Mint === WSOL_MINT_ADDRESS) {
    tokenDecimals = poolData.mint0Decimals;
  } else {
    throw new Error('CPMM Sell: 토큰 mint 정보를 확인할 수 없습니다.');
  }

    const lamportsValue = Math.floor(tokenToLamports(sellTokenAmount, tokenDecimals));
    const amountInLamports = new BN(lamportsValue.toString());
    const minAmountOut = new BN(0);
  
  
  let inputMint: string, outputMint: string;
  const baseMint = poolData.token0Mint;
  const quoteMint = poolData.token1Mint;
  // WSOL이 존재하는 쪽을 출력(솔)으로, 반대 쪽을 판매할 토큰 (입력)으로 지정
  if (baseMint === WSOL_MINT_ADDRESS) {
    inputMint = quoteMint;
    outputMint = WSOL_MINT_ADDRESS;
  } else if (quoteMint === WSOL_MINT_ADDRESS) {
    inputMint = baseMint;
    outputMint = WSOL_MINT_ADDRESS;
  } else {
    throw new Error('SellCpmm: 풀 정보에 WSOL이 존재하지 않습니다.');
  }
  
  const inputMintPubkey = new PublicKey(inputMint);
  const outputMintPubkey = new PublicKey(outputMint);
  
  // 3. 사용자 ATA (Associated Token Account) 조회
  const userInputTokenAccount = await getAssociatedTokenAddress(inputMintPubkey, wallet.publicKey);
  const userOutputTokenAccount = await getAssociatedTokenAddress(outputMintPubkey, wallet.publicKey);

  // 4. 풀 관련 계정 및 프로그램 정보 세팅
  const payer = wallet.publicKey;
  const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const CPMM_PROGRAM_ID = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
  const ammAuthority = new PublicKey(poolData.authority || 'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL');
  const ammammConfig = new PublicKey(poolData.AmmConfig);
  const PoolState = new PublicKey(poolData.poolid || poolData.poolId);
  
  // 5. 풀 Vault 계정 할당  
  // - baseMint가 WSOL이면, poolCoinTokenAccount = token0Vault, poolPcTokenAccount = token1Vault  
  // - baseMint가 WSOL이 아니면, poolCoinTokenAccount = token1Vault, poolPcTokenAccount = token0Vault
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

  // 6. Vault 결정: Sell 거래에서는 판매할 토큰의 vault가 입력, WSOL vault가 출력
  let inputVault: PublicKey, outputVault: PublicKey;
  if (baseMint === WSOL_MINT_ADDRESS) {
    // baseMint가 WSOL이면, 판매할 토큰은 quote token → 입력 vault: quote vault, 출력 vault: base vault
    inputVault = poolPcTokenAccount;
    outputVault = poolCoinTokenAccount;
  } else {
    // 반대로, WSOL이 quoteMint이면, 판매할 토큰은 base token → 입력 vault: base vault, 출력 vault: quote vault
    inputVault = poolCoinTokenAccount;
    outputVault = poolPcTokenAccount;
  }

  // 7. SDK의 스왑 함수 호출: makeSwapCpmmBaseInInstruction
  //    - amountIn: 판매할 토큰의 양, amountOutMin은 0으로 지정합니다.
  const swapInstruction = makeSwapCpmmBaseInInstruction(
    CPMM_PROGRAM_ID,           // CPMM 프로그램 ID
    payer,                     // 사용자 지갑 (payer)
    ammAuthority,              // 풀의 authority
    ammammConfig,              // 구성 계정 (configId)
    PoolState,                 // 풀 상태 (poolId)
    userInputTokenAccount,     // 사용자 입력 토큰 계정 (판매할 토큰)
    userOutputTokenAccount,    // 사용자 출력 토큰 계정 (WSOL)
    inputVault,                // 풀의 입력 vault (판매할 토큰 vault)
    outputVault,               // 풀의 출력 vault (WSOL vault)
    TOKEN_PROGRAM_ID,          // 입력 토큰 프로그램 (SPL-Token)
    TOKEN_PROGRAM_ID,          // 출력 토큰 프로그램 (SPL-Token)
    inputMintPubkey,           // 입력 토큰 mint (판매할 토큰)
    outputMintPubkey,          // 출력 토큰 mint (WSOL)
    observationState,          // 관찰 계정
    amountInLamports,                  // 판매할 토큰 양 (BN)
    minAmountOut               // 최소 수령 SOL (0)
  );

  instructions.push(swapInstruction);
  return instructions;
}
