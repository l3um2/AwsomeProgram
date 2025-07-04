import {
  Connection,
  PublicKey,
  Keypair,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import BN from 'bn.js';
import * as borsh from 'borsh';

// Swap 인스트럭션 구조체 정의
export class MeteoraSwapInstruction {
  discriminator: Uint8Array;
  maxInAmount: BN;
  outAmount: BN;

  constructor(fields: { discriminator: Uint8Array; maxInAmount: BN; outAmount: BN }) {
    this.discriminator = fields.discriminator;
    this.maxInAmount = fields.maxInAmount;
    this.outAmount = fields.outAmount;
  }
}

export const MeteoraSwapSchema = new Map([
  [
    MeteoraSwapInstruction,
    {
      kind: 'struct',
      fields: [
        ['discriminator', [8]],   // 8바이트 배열
        ['maxInAmount', 'u64'],   // u64
        ['outAmount', 'u64'],     // u64
      ],
    },
  ],
]);

// 지갑 로드 함수
export function loadWalletKey(): Keypair {
  const privateKeyBase58 = process.env.WALLET_PRIVATE_KEY;
  if (!privateKeyBase58) {
    throw new Error('환경 변수 WALLET_PRIVATE_KEY가 설정되지 않았습니다.');
  }
  return Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
}

// ATA 생성 유틸리티 함수
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

// Bin Array 계정 설정
async function getBinArrayAccounts(routeSection: any, swapType: string): Promise<PublicKey[]> {
  let accounts: string[] = [];
  if (swapType === 'buy') {
    accounts = [
      routeSection.BinArray1,
      routeSection.BinArray2,
      routeSection.BinArray3,
    ];
  } else {
    throw new Error(`알 수 없는 스왑 타입: ${swapType}`);
  }
  return accounts.filter(bin => bin && bin !== "0").map(bin => new PublicKey(bin));
}

// Bin Array 계정 유효성 검사
async function validateBinArrayAccounts(
  connection: Connection,
  binArrayAccounts: PublicKey[]
): Promise<void> {
  for (const binAccount of binArrayAccounts) {
    const info = await connection.getAccountInfo(binAccount);
    if (!info) {
      throw new Error(`Bin Array 계정이 존재하지 않습니다: ${binAccount.toBase58()}`);
    }
  }
}

// 스왑 파라미터 계산
function getSwapParameters(route: any): { maxInAmount: BN; outAmount: BN } {
  const buysol = route.optimalBuySol;
  const maxInAmount = new BN(Math.floor(buysol * 1e9).toString());
  const outAmount = new BN(Math.floor(route.expectedBuyToken * 1e6).toString());
  return { maxInAmount, outAmount };
}

export async function createBuyInstruction(
  routeSection: any, // route.buy 블록
  route: any,
  connection: Connection,
  wallet: Keypair
): Promise<TransactionInstruction[]> {
  if (routeSection.buy_type?.toUpperCase() !== 'DLMM') {
    throw new Error(`'buy' 타입이 DLMM이 아닙니다.`);
  }

  // SOL Mint
  const WSOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
  const WSOL_MINT_PUBLIC_KEY = new PublicKey(WSOL_MINT_ADDRESS);

  // input/output 민트 결정
  let inputMint: PublicKey, outputMint: PublicKey;
  if (routeSection.tokenXMint === WSOL_MINT_ADDRESS) {
    inputMint = WSOL_MINT_PUBLIC_KEY;
    outputMint = new PublicKey(routeSection.tokenYMint);
  } else (routeSection.tokenYMint === WSOL_MINT_ADDRESS) 
    inputMint = WSOL_MINT_PUBLIC_KEY;
    outputMint = new PublicKey(routeSection.tokenXMint);
  

  // ATA 생성
  const inputAtaResult = await createAtaIfNotExist(connection, wallet.publicKey, inputMint);
  const outputAtaResult = await createAtaIfNotExist(connection, wallet.publicKey, outputMint);
  const ataInstructions = [...inputAtaResult.instructions, ...outputAtaResult.instructions];

  // Bin Array
  const binArrayAccounts = await getBinArrayAccounts(routeSection, 'buy');
  if (binArrayAccounts.length > 0) {
    await validateBinArrayAccounts(connection, binArrayAccounts);
  }

  // 파라미터
  const { maxInAmount, outAmount } = getSwapParameters(route);

  // Swap 데이터
  const DISCRIMINATOR = Uint8Array.from([0xfa,0x49,0x65,0x21,0x26,0xcf,0x4b,0xb8]);
  const swapDataObj = new MeteoraSwapInstruction({ discriminator: DISCRIMINATOR, maxInAmount, outAmount });
  const swapDataBuffer = Buffer.from(borsh.serialize(MeteoraSwapSchema, swapDataObj));

  // 계정 배열
  const lbPairPubkey = new PublicKey(routeSection.buypool_id);
  const reserveX = new PublicKey(routeSection.reserveX);
  const reserveY = new PublicKey(routeSection.reserveY);
  const oracle = new PublicKey(routeSection.oracle);
  const DLMM_PROGRAM_ID = new PublicKey('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo');
  const hostFeeIn = DLMM_PROGRAM_ID;
  const user = wallet.publicKey;
  const eventAuthority = new PublicKey('D1ZN9Wj1fRSUQfCjhvnu1hqDMT7hzjzBBpi12nVniYD6');

  const keysBase = [
    { pubkey: lbPairPubkey, isSigner: false, isWritable: true },
    { pubkey: DLMM_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: reserveX, isSigner: false, isWritable: true },
    { pubkey: reserveY, isSigner: false, isWritable: true },
    { pubkey: inputAtaResult.address, isSigner: false, isWritable: true },
    { pubkey: outputAtaResult.address, isSigner: false, isWritable: true },
    { pubkey: new PublicKey(routeSection.tokenXMint), isSigner: false, isWritable: false },
    { pubkey: new PublicKey(routeSection.tokenYMint), isSigner: false, isWritable: false },
    { pubkey: oracle, isSigner: false, isWritable: true },
    { pubkey: hostFeeIn, isSigner: false, isWritable: true },
    { pubkey: user, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: DLMM_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  const binArrayKeys = binArrayAccounts.map(pubkey => ({
    pubkey,
    isSigner: false,
    isWritable: true,
  }));

  const swapIx = new TransactionInstruction({
    keys: [...keysBase, ...binArrayKeys],
    programId: DLMM_PROGRAM_ID,
    data: swapDataBuffer,
  });

  const computeUnitLimitRequest = ComputeBudgetProgram.setComputeUnitLimit({ units: 152228 });
  const priorityFeeRequest = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 });

  return [...ataInstructions, computeUnitLimitRequest, priorityFeeRequest, swapIx];
}
