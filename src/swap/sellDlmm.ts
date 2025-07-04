// src/swap/sellDlmm.ts
import { 
  Connection, 
  PublicKey, 
  Keypair, 
  TransactionInstruction, 
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  TOKEN_PROGRAM_ID 
} from '@solana/spl-token';
import bs58 from 'bs58';
import BN from 'bn.js';
import * as borsh from 'borsh';

export class MeteoraSwapInstruction {
  discriminator: Uint8Array;
  amount_in: BN;
  min_amount_out: BN;

  constructor(fields: { discriminator: Uint8Array; amount_in: BN; min_amount_out: BN }) {
    this.discriminator = fields.discriminator;
    this.amount_in = fields.amount_in;
    this.min_amount_out = fields.min_amount_out;
  }
}

export const MeteoraSwapSchema = new Map([
  [
    MeteoraSwapInstruction,
    {
      kind: 'struct',
      fields: [
        ['discriminator', [8]],
        ['amount_in', 'u64'],
        ['min_amount_out', 'u64'],
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

async function getBinArrayAccounts(routeSection: any, swapType: string): Promise<PublicKey[]> {
  let accounts: string[] = [];
  if (swapType === 'sell') {
    accounts = [
      routeSection.BinArray1,
      routeSection.BinArray2,
      routeSection.BinArray3,
      // 필요 시 추가
    ];
  } else {
    throw new Error(`알 수 없는 스왑 타입: ${swapType}`);
  }
  return accounts.filter(bin => bin && bin !== "0").map(bin => new PublicKey(bin));
}

async function validateBinArrayAccounts(
  connection: Connection,
  binArrayAccounts: PublicKey[]
): Promise<void> {
  for (const binAccount of binArrayAccounts) {
    const accountInfo = await connection.getAccountInfo(binAccount);
    if (accountInfo === null) {
      throw new Error(`Bin Array 계정이 존재하지 않습니다: ${binAccount.toBase58()}`);
    }
  }
}

function getSwapParameters(route: any, swapType: string): { amount_in: BN; min_amount_out: BN } {
  if (swapType === 'sell') {
    const selltoken = route.expectedBuyToken;
    const amount_in = new BN(Math.floor(selltoken * 1e6).toString());
    const min_amount_out = new BN(0);
    return { amount_in, min_amount_out };
  } else {
    throw new Error(`알 수 없는 스왑 타입: ${swapType}`);
  }
}

export async function createSellInstruction(
  routeSection: any,  // route.sell 블록
  route: any,
  connection: Connection,
  wallet: Keypair
): Promise<TransactionInstruction[]> {

  if (routeSection.sell_type?.toUpperCase() !== 'DLMM') {
    throw new Error(`'sell' 타입이 DLMM이 아닙니다.`);
  }

  const WSOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
  const WSOL_MINT_PUBLIC_KEY = new PublicKey(WSOL_MINT_ADDRESS);

  // tokenXMint, tokenYMint 중 어떤 토큰이 SOL인지 확인하여,
  // SOL 계정은 userTokenOut으로, SOL이 아닌 토큰 계정은 userTokenIn으로 설정합니다.
  let inputMint: PublicKey, outputMint: PublicKey;
  if (routeSection.tokenXMint === WSOL_MINT_ADDRESS) {
    // tokenXMint이 SOL인 경우: SOL은 출력, 입력은 tokenYMint
    inputMint = new PublicKey(routeSection.tokenYMint);
    outputMint = WSOL_MINT_PUBLIC_KEY;
  } else if (routeSection.tokenYMint === WSOL_MINT_ADDRESS) {
    // tokenYMint이 SOL인 경우: SOL은 출력, 입력은 tokenXMint
    inputMint = new PublicKey(routeSection.tokenXMint);
    outputMint = WSOL_MINT_PUBLIC_KEY;
  } else {
    throw new Error("Sell DLMM: 두 토큰 중 SOL(Mint) 정보가 없습니다.");
  }

  const userTokenIn = await getAssociatedTokenAddress(inputMint, wallet.publicKey);
  const userTokenOut = await getAssociatedTokenAddress(outputMint, wallet.publicKey);

  const binArrayAccounts = await getBinArrayAccounts(routeSection, 'sell');
  if (binArrayAccounts.length > 0) {
    await validateBinArrayAccounts(connection, binArrayAccounts);
  }

  const { amount_in, min_amount_out } = getSwapParameters(route, 'sell');

  const FAKE_IX_DISCRIMINATOR = Uint8Array.from([0xf8, 0xc6, 0x9e, 0x91, 0xe1, 0x75, 0x87, 0xc8]);
  const swapDataObj = new MeteoraSwapInstruction({
    discriminator: FAKE_IX_DISCRIMINATOR,
    amount_in,
    min_amount_out,
  });
  const swapDataBuffer = Buffer.from(borsh.serialize(MeteoraSwapSchema, swapDataObj));

  const lbPairPubkey = new PublicKey(routeSection.sellpool_id);
  const reserveX = new PublicKey(routeSection.reserveX);
  const reserveY = new PublicKey(routeSection.reserveY);
  const tokenXMint = new PublicKey(routeSection.tokenXMint);
  const tokenYMint = new PublicKey(routeSection.tokenYMint);
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
    { pubkey: userTokenIn, isSigner: false, isWritable: true },
    { pubkey: userTokenOut, isSigner: false, isWritable: true },
    { pubkey: tokenXMint, isSigner: false, isWritable: false },
    { pubkey: tokenYMint, isSigner: false, isWritable: false },
    { pubkey: oracle, isSigner: false, isWritable: true },
    { pubkey: hostFeeIn, isSigner: false, isWritable: true },
    { pubkey: user, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: DLMM_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  const binArrayAccountsFormatted = binArrayAccounts.map(pubkey => ({
    pubkey,
    isSigner: false,
    isWritable: true,
  }));

  const keys = [...keysBase, ...binArrayAccountsFormatted];

  const swapIx = new TransactionInstruction({
    keys,
    programId: DLMM_PROGRAM_ID,
    data: swapDataBuffer,
  });

  return [swapIx];
}
