// src/decoders/DymDecoder.ts
import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { Buffer } from 'buffer';

/** 
 * Interfaces 
 */
export interface DymPoolState {
  lp_mint: string;
  token_a_mint: string;
  token_b_mint: string;
  a_vault: string;
  b_vault: string;
  a_vault_lp: string;
  b_vault_lp: string;
  a_vault_lp_bump: number;
  enabled: boolean;
  protocol_token_a_fee: string;
  protocol_token_b_fee: string;
  fee_last_updated_at: string;
  _padding0: Buffer;
  fees: Buffer;
  pool_type: number;
  stake: string;
  total_locked_lp: string;
  bootstrapping: Buffer;
  partner_info: Buffer;
  padding: Buffer;
  curve_type: number;
}

export interface VaultState {
  enabled: boolean;
  bumps: Buffer;
  total_amount: string;
  token_vault: string;
  fee_vault: string;
  token_mint: string;
  lp_mint: string;
  strategies: string[];
  base: string;
  admin: string;
  operator: string;
  locked_profit_tracker: Buffer;
}

/** 
 * Composite state that includes pool + vault details 
 */
export interface CompositeDymState extends DymPoolState {
  a_token_vault: string;
  a_lp_mint: string;
  b_token_vault: string;
  b_lp_mint: string;
  a_total_amount: string;
  b_total_amount: string;
}

/** 
 * Helpers to read raw data 
 */
function readBigIntLE(buffer: Buffer, offset: number, byteLength: number): { value: bigint; newOffset: number } {
  const slice = buffer.slice(offset, offset + byteLength);
  const hex = slice.toString('hex');
  return { value: BigInt(`0x${hex}`), newOffset: offset + byteLength };
}

function readPublicKey(buffer: Buffer, offset: number): { value: string; newOffset: number } {
  const key = new PublicKey(buffer.slice(offset, offset + 32)).toBase58();
  return { value: key, newOffset: offset + 32 };
}

/** 
 * Decode raw Dym pool data 
 */
export function decodeDymPoolData(buffer: Buffer): DymPoolState {
  let offset = 0;
  offset += 8; // discriminator

  const lpRes = readPublicKey(buffer, offset);
  const lp_mint = lpRes.value; offset = lpRes.newOffset;
  const aMintRes = readPublicKey(buffer, offset);
  const token_a_mint = aMintRes.value; offset = aMintRes.newOffset;
  const bMintRes = readPublicKey(buffer, offset);
  const token_b_mint = bMintRes.value; offset = bMintRes.newOffset;

  const aVaultRes = readPublicKey(buffer, offset);
  const a_vault = aVaultRes.value; offset = aVaultRes.newOffset;
  const bVaultRes = readPublicKey(buffer, offset);
  const b_vault = bVaultRes.value; offset = bVaultRes.newOffset;
  const aLpRes = readPublicKey(buffer, offset);
  const a_vault_lp = aLpRes.value; offset = aLpRes.newOffset;
  const bLpRes = readPublicKey(buffer, offset);
  const b_vault_lp = bLpRes.value; offset = bLpRes.newOffset;

  const a_vault_lp_bump = buffer.readUInt8(offset); offset += 1;
  const enabled = buffer.readUInt8(offset) === 1; offset += 1;

  const protoARes = readPublicKey(buffer, offset);
  const protocol_token_a_fee = protoARes.value; offset = protoARes.newOffset;
  const protoBRes = readPublicKey(buffer, offset);
  const protocol_token_b_fee = protoBRes.value; offset = protoBRes.newOffset;

  const feeTimeRes = readBigIntLE(buffer, offset, 8);
  const fee_last_updated_at = feeTimeRes.value.toString(); offset = feeTimeRes.newOffset;

  const _padding0 = buffer.slice(offset, offset + 24); offset += 24;
  const fees = buffer.slice(offset, offset + 48); offset += 48;

  const pool_type = buffer.readUInt8(offset); offset += 1;
  const stakeRes = readPublicKey(buffer, offset);
  const stake = stakeRes.value; offset = stakeRes.newOffset;

  const lockedRes = readBigIntLE(buffer, offset, 8);
  const total_locked_lp = lockedRes.value.toString(); offset = lockedRes.newOffset;

  const BOOTSTRAP_SIZE = 32; // adjust if needed
  const bootstrapping = buffer.slice(offset, offset + BOOTSTRAP_SIZE);
  offset += BOOTSTRAP_SIZE;

  const PARTNER_INFO_SIZE = 32; // adjust if needed
  const partner_info = buffer.slice(offset, offset + PARTNER_INFO_SIZE);
  offset += PARTNER_INFO_SIZE;

  const remaining = buffer.length - offset;
  const padding = buffer.slice(offset, offset + remaining - 1);
  offset += padding.length;

  const curve_type = buffer.readUInt8(offset);

  return {
    lp_mint,
    token_a_mint,
    token_b_mint,
    a_vault,
    b_vault,
    a_vault_lp,
    b_vault_lp,
    a_vault_lp_bump,
    enabled,
    protocol_token_a_fee,
    protocol_token_b_fee,
    fee_last_updated_at,
    _padding0,
    fees,
    pool_type,
    stake,
    total_locked_lp,
    bootstrapping,
    partner_info,
    padding,
    curve_type,
  };
}

/** 
 * Decode raw Vault data 
 */
const DISCRIM = 8;
const U64 = 8;
const PUBKEY_LEN = 32;
const BUMPS_SIZE = 2;           // adjust
const MAX_STRATEGY = 5;         // adjust
const LOCKED_PROFIT_SIZE = 16;  // adjust

export function decodeVaultData(buffer: Buffer): VaultState {
  let offset = DISCRIM;

  const enabled = buffer.readUInt8(offset) === 1; offset += 1;
  const bumps = buffer.slice(offset, offset + BUMPS_SIZE); offset += BUMPS_SIZE;

  const totalAmountBuf = buffer.slice(offset, offset + U64);
  const total_amount = BigInt(`0x${totalAmountBuf.toString('hex')}`).toString();
  offset += U64;

  const token_vault = new PublicKey(buffer.slice(offset, offset + PUBKEY_LEN)).toBase58();
  offset += PUBKEY_LEN;

  const fee_vault = new PublicKey(buffer.slice(offset, offset + PUBKEY_LEN)).toBase58();
  offset += PUBKEY_LEN;

  const token_mint = new PublicKey(buffer.slice(offset, offset + PUBKEY_LEN)).toBase58();
  offset += PUBKEY_LEN;

  const lp_mint = new PublicKey(buffer.slice(offset, offset + PUBKEY_LEN)).toBase58();
  offset += PUBKEY_LEN;

  const strategies: string[] = [];
  for (let i = 0; i < MAX_STRATEGY; i++) {
    strategies.push(new PublicKey(buffer.slice(offset, offset + PUBKEY_LEN)).toBase58());
    offset += PUBKEY_LEN;
  }

  const base = new PublicKey(buffer.slice(offset, offset + PUBKEY_LEN)).toBase58();
  offset += PUBKEY_LEN;

  const admin = new PublicKey(buffer.slice(offset, offset + PUBKEY_LEN)).toBase58();
  offset += PUBKEY_LEN;

  const operator = new PublicKey(buffer.slice(offset, offset + PUBKEY_LEN)).toBase58();
  offset += PUBKEY_LEN;

  const locked_profit_tracker = buffer.slice(offset, offset + LOCKED_PROFIT_SIZE);

  return {
    enabled,
    bumps,
    total_amount,
    token_vault,
    fee_vault,
    token_mint,
    lp_mint,
    strategies,
    base,
    admin,
    operator,
    locked_profit_tracker,
  };
}

/** 
 * Fetch & decode vault account 
 */
export class VaultDecoder {
  static async fetchAndDecode(
    connection: Connection,
    address: PublicKey
  ): Promise<VaultState> {
    const info: AccountInfo<Buffer> | null = await connection.getAccountInfo(address);
    if (!info) throw new Error(`Vault account not found: ${address.toBase58()}`);
    return decodeVaultData(info.data);
  }
}

/** 
 * Main Composite Decoder 
 */
export class DymDecoder {
  static decode(buffer: Buffer): DymPoolState {
    return decodeDymPoolData(buffer);
  }

  /**
   * Fetches pool + its two vaults and returns combined state
   */
  static async fetchAndDecodeComposite(
    connection: Connection,
    poolAddress: PublicKey
  ): Promise<CompositeDymState> {
    const info = await connection.getAccountInfo(poolAddress);
    if (!info) throw new Error(`Pool account not found: ${poolAddress.toBase58()}`);

    const poolState = decodeDymPoolData(info.data);

    // fetch vault A and B
    const vaultA = await VaultDecoder.fetchAndDecode(connection, new PublicKey(poolState.a_vault));
    const vaultB = await VaultDecoder.fetchAndDecode(connection, new PublicKey(poolState.b_vault));

    return {
      ...poolState,
      a_token_vault: vaultA.token_vault,
      a_lp_mint: vaultA.lp_mint,
      b_token_vault: vaultB.token_vault,
      b_lp_mint: vaultB.lp_mint,
      a_total_amount: vaultA.total_amount,
      b_total_amount: vaultB.total_amount,
    };
  }
}
