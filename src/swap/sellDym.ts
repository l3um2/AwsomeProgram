// src/swap/sellDym.ts
import {
    Connection,
    PublicKey,
    Keypair,
    TransactionInstruction,
  } from '@solana/web3.js';
  import {
    getAssociatedTokenAddress,
    getMint,
    TOKEN_PROGRAM_ID,
  } from '@solana/spl-token';
  import bs58 from 'bs58';
  import BN from 'bn.js';
  import * as borsh from 'borsh';
  
  // 1) borsh용 스왑 데이터 구조 (Buy와 동일)
  export class DynamicAmmSwapInstruction {
    amount: BN;           // 입력 토큰 수량
    minimumOutAmount: BN; // 최소 WSOL 수량
  
    constructor(fields: { amount: BN; minimumOutAmount: BN }) {
      this.amount = fields.amount;
      this.minimumOutAmount = fields.minimumOutAmount;
    }
  }
  
  export const DynamicAmmSwapSchema = new Map([
    [DynamicAmmSwapInstruction, {
      kind: 'struct',
      fields: [
        ['amount', 'u64'],
        ['minimumOutAmount', 'u64'],
      ],
    }],
  ]);
  
  export function loadWalletKey(): Keypair {
    const privateKeyBase58 = process.env.WALLET_PRIVATE_KEY;
    if (!privateKeyBase58) {
      throw new Error('환경 변수 WALLET_PRIVATE_KEY가 설정되지 않았습니다.');
    }
    return Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
  }
  
  function toSmallestUnit(amount: number, decimals: number): number {
    return Math.floor(amount * 10 ** decimals);
  }
  
  /**
   * DYM 풀에서 토큰을 팔아 WSOL을 받는 스왑 인스트럭션 생성
   *
   * @param routeSection  route.sell 블록 (sell_type==='DYM')
   * @param route         전체 라우트 결과 (amount/minimumOut 필드 이름 확인 필요)
   * @param connection    Solana RPC Connection
   * @param wallet        사용자 Keypair
   */
  export async function createSellInstruction(
    routeSection: any,
    route: any,
    connection: Connection,
    wallet: Keypair
  ): Promise<TransactionInstruction[]> {
    // 1) 타입 확인
    if (routeSection.sell_type?.toUpperCase() !== 'DYM') {
      throw new Error(`'sell' 타입이 Dynamic AMM이 아닙니다.`);
    }
  
    const WSOL          = 'So11111111111111111111111111111111111111112';
    const WSOL_MINT     = new PublicKey(WSOL);
    let inputMint: PublicKey;
    let protocolFeeKey: { pubkey: PublicKey; isSigner: false; isWritable: true };
  
    // 2) inputMint = non-WSOL 토큰, protocol fee 계정 선택
    if (routeSection.tokenAMint === WSOL) {
      inputMint     = new PublicKey(routeSection.tokenBMint);
      protocolFeeKey = {
        pubkey: new PublicKey(routeSection.protocol_token_b_fee),
        isSigner: false,
        isWritable: true,
      };
    } else if (routeSection.tokenBMint === WSOL) {
      inputMint     = new PublicKey(routeSection.tokenAMint);
      protocolFeeKey = {
        pubkey: new PublicKey(routeSection.protocol_token_a_fee),
        isSigner: false,
        isWritable: true,
      };
    } else {
      throw new Error('DYM Sell: 풀에 WSOL이 포함되어 있지 않습니다.');
    }
  
    // 3) decimals 조회
    const inputDecimals  = (await getMint(connection, inputMint)).decimals;
  
    // 4) ATA 조회 (생성은 하지 않음)
    const inputAta  = await getAssociatedTokenAddress(inputMint, wallet.publicKey);
    const outputAta = await getAssociatedTokenAddress(WSOL_MINT, wallet.publicKey);
  
    // 5) 수량 계산
    const amount           = new BN(toSmallestUnit(route.expectedBuyToken, inputDecimals).toString());
    const minimumOutAmount = new BN(0);
  
    const swapPayload = new DynamicAmmSwapInstruction({ amount, minimumOutAmount });
    const data = Buffer.from(borsh.serialize(DynamicAmmSwapSchema, swapPayload));
  
    // 6) 프로그램 ID
    const DYM_PROGRAM_ID = new PublicKey('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo');
    const VAULT_PROGRAM  = new PublicKey('24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi');
  
    // 7) 키 배열: vault 계정은 a→b 순서 고정
    const keys = [
      { pubkey: new PublicKey(routeSection.poolId),   isSigner: false, isWritable: true },
      { pubkey: inputAta,                             isSigner: false, isWritable: true },
      { pubkey: outputAta,                            isSigner: false, isWritable: true },
  
      { pubkey: new PublicKey(routeSection.a_vault),       isSigner: false, isWritable: true },
      { pubkey: new PublicKey(routeSection.b_vault),       isSigner: false, isWritable: true },
      { pubkey: new PublicKey(routeSection.a_token_vault), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(routeSection.b_token_vault), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(routeSection.a_lp_mint),     isSigner: false, isWritable: false },
      { pubkey: new PublicKey(routeSection.b_lp_mint),     isSigner: false, isWritable: false },
      { pubkey: new PublicKey(routeSection.a_vault_lp),    isSigner: false, isWritable: true },
      { pubkey: new PublicKey(routeSection.b_vault_lp),    isSigner: false, isWritable: true },
  
      // 8) protocol fee 계정
      protocolFeeKey,
  
      { pubkey: wallet.publicKey,      isSigner: true, isWritable: false },
      { pubkey: VAULT_PROGRAM,         isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID,      isSigner: false, isWritable: false },
    ];
  
    // 9) Swap 인스트럭션 생성 및 반환
    const swapIx = new TransactionInstruction({
      keys,
      programId: DYM_PROGRAM_ID,
      data,
    });
  
    return [swapIx];
  }
  