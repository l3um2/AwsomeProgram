// src/swap/buyClmm.ts
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
  } from '@solana/spl-token';
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
  
  function tokenToSmallestUnit(amount: number, decimals: number): number {
    return Math.floor(amount * Math.pow(10, decimals));
  }
  
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
  const WSOL_MINT_PUBLIC_KEY = new PublicKey(WSOL_MINT_ADDRESS);
  
  export async function createBuyInstruction(
    poolInfo: any,
    route: any,
    connection: Connection,
    wallet: Keypair
  ): Promise<TransactionInstruction[]> {
    const instructions: TransactionInstruction[] = [];
  
    function solToLamports(sol: number): number {
      return sol * 1e9;
    }
  
    const buysol = route.optimalBuySol;
    const maxAmountIn = new BN(solToLamports(buysol).toString());
  
    // 출력 토큰 mint 결정
    let tokenAMint: PublicKey;
    if (poolInfo.tokenMint0 === WSOL_MINT_ADDRESS) {
      tokenAMint = new PublicKey(poolInfo.tokenMint1);
    } else if (poolInfo.tokenMint1 === WSOL_MINT_ADDRESS) {
      tokenAMint = new PublicKey(poolInfo.tokenMint0);
    } else {
      throw new Error('CLMM Buy: 풀 정보에 WSOL이 포함되어 있지 않습니다.');
    }
  
    let tokenDecimals: number;
    if (poolInfo.tokenMint0 === WSOL_MINT_ADDRESS) {
      tokenDecimals = poolInfo.mintDecimals1;
    } else {
      tokenDecimals = poolInfo.mintDecimals0;
    }
    const rawExpectedBuyToken = route.expectedBuyToken;
    const tokenAmountOut = tokenToSmallestUnit(rawExpectedBuyToken, tokenDecimals);
    const amountOut = new BN(tokenAmountOut.toString());
  
    // ATA 생성
    const inputAtaResult = await createAtaIfNotExist(connection, wallet.publicKey, WSOL_MINT_PUBLIC_KEY);
    const outputAtaResult = await createAtaIfNotExist(connection, wallet.publicKey, tokenAMint);
    if (inputAtaResult.instructions.length > 0) instructions.push(...inputAtaResult.instructions);
    if (outputAtaResult.instructions.length > 0) instructions.push(...outputAtaResult.instructions);
  
    // ComputeBudget
    instructions.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
    );
  
    // Clmm 스왑 인스트럭션 생성
    const poolId = new PublicKey(poolInfo.poolId);
    const ammConfig = new PublicKey(poolInfo.ammConfig);
    const tokenVault0 = new PublicKey(poolInfo.tokenVault0);
    const tokenVault1 = new PublicKey(poolInfo.tokenVault1);
    const observationKey = new PublicKey(poolInfo.observationKey);
  
    // tick array 계정 설정
    let tickArrayAccounts: PublicKey[];
    if (poolInfo.tokenMint0 === WSOL_MINT_ADDRESS) {
      tickArrayAccounts = [
        new PublicKey(poolInfo.currentTickArray),
        new PublicKey(poolInfo.exBitmapAccount),
        new PublicKey(poolInfo.previousTickArray),
      //  new PublicKey(poolInfo.prepreviousTickArray),
      ];
    } else {
      tickArrayAccounts = [
        new PublicKey(poolInfo.currentTickArray),
        new PublicKey(poolInfo.exBitmapAccount),
        new PublicKey(poolInfo.nextTickArray),
      //  new PublicKey(poolInfo.nextnextTickArray),
      ];
    }
  
    let inputVault: PublicKey, outputVault: PublicKey;
    if (poolInfo.tokenMint0 === WSOL_MINT_ADDRESS) {
      inputVault = tokenVault0;
      outputVault = tokenVault1;
    } else {
      inputVault = tokenVault1;
      outputVault = tokenVault0;
    }
    console.log("poolId:", poolId.toBase58());
    console.log("ammConfig:", new PublicKey(poolInfo.ammConfig).toBase58());
    console.log("inputVault:", inputVault.toBase58());
    console.log("outputVault:", outputVault.toBase58());
    console.log("inputTokenMint:", route.inputTokenMint.toBase58());
    console.log("outputTokenMint:", route.outputTokenMint.toBase58());
    console.log("observationKey:", new PublicKey(poolInfo.observationKey).toBase58());
    console.log("amount:", route.inputAmountBN.toString());
    console.log("otherAmountThreshold:", route.expectedBuyToken.toString());
    console.log("isBaseIn:", true);
    console.log("zeroForOne:", route.zeroForOne);
  
    const swapIx = ClmmInstrument.swapInstruction(
      new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'),
      wallet.publicKey,
      poolId,
      ammConfig,
      inputAtaResult.address,
      outputAtaResult.address,
      inputVault,
      outputVault,
      WSOL_MINT_PUBLIC_KEY,
      tokenAMint,
      tickArrayAccounts,
      observationKey,
      amountOut,
      maxAmountIn,
      new BN(0),
      false
    );
  
    instructions.push(swapIx);
    return instructions;
  }
  