// src/decoders/DlmmDecoder.ts
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

export interface DlmmPoolState {
  parameters: {
    baseFactor: number;
    filterPeriod: number;
    decayPeriod: number;
    reductionFactor: number;
    variableFeeControl: number;
    maxVolatilityAccumulator: number;
    minBinId: number;
    maxBinId: number;
    protocolShare: number;
    padding: Buffer;
  };
  v_parameters: {
    volatilityAccumulator: number;
    volatilityReference: number;
    indexReference: number;
    padding: Buffer;
    lastUpdateTimestamp: string;
    padding1: Buffer;
  };
  bump_seed: Buffer;
  bin_step_seed: Buffer;
  pair_type: number;
  active_id: number;
  bin_step: number;
  status: number;
  require_base_factor_seed: number;
  base_factor_seed: Buffer;
  activation_type: number;
  _padding_0: number;
  token_x_mint: string;
  token_y_mint: string;
  reserve_x: string;
  reserve_y: string;
  protocol_fee: {
    amount_x: string;
    amount_y: string;
  };
  _padding_1: Buffer;
  reward_infos: Array<{
    mint: string;
    vault: string;
    funder: string;
    reward_duration: string;
    reward_duration_end: string;
    reward_rate: string;
    last_update_time: string;
    cumulative_seconds_with_empty_liquidity_reward: string;
  }>;
  oracle: string;
  bin_array_bitmap: string[];
  last_updated_at: string;
  _padding_2: Buffer;
  pre_activation_swap_address: string;
  base_key: string;
  activation_point: string;
  pre_activation_duration: string;
  _padding_3: Buffer;
  _padding_4: string;
  creator: string;
  _reserved: Buffer;
}

function readBigIntLE(buffer: Buffer, offset: number, byteLength: number): { value: bigint; newOffset: number } {
  if (offset + byteLength > buffer.length) {
    throw new RangeError(`Offset ${offset} + byteLength ${byteLength} exceeds buffer length ${buffer.length}`);
  }
  const hex = buffer.slice(offset, offset + byteLength).toString('hex');
  const value = BigInt(`0x${hex}`);
  return { value, newOffset: offset + byteLength };
}

function readPublicKey(buffer: Buffer, offset: number): { value: string; newOffset: number } {
  if (offset + 32 > buffer.length) {
    throw new RangeError(`Offset ${offset} + 32 exceeds buffer length ${buffer.length}`);
  }
  const key = new PublicKey(buffer.slice(offset, offset + 32)).toBase58();
  return { value: key, newOffset: offset + 32 };
}

export function decodeDLMMPoolData(buffer: Buffer): DlmmPoolState | null {
  let offset = 0;
  try {
    // 1) discriminator (8바이트) 스킵
    offset += 8;

    // 2) parameters (32바이트)
    const parameters = {
      baseFactor: buffer.readUInt16LE(offset),
      filterPeriod: buffer.readUInt16LE(offset + 2),
      decayPeriod: buffer.readUInt16LE(offset + 4),
      reductionFactor: buffer.readUInt16LE(offset + 6),
      variableFeeControl: buffer.readUInt32LE(offset + 8),
      maxVolatilityAccumulator: buffer.readUInt32LE(offset + 12),
      minBinId: buffer.readInt32LE(offset + 16),
      maxBinId: buffer.readInt32LE(offset + 20),
      protocolShare: buffer.readUInt16LE(offset + 24),
      padding: buffer.slice(offset + 26, offset + 32),
    };
    offset += 32;

    // 3) v_parameters (32바이트)
    const v_parameters = {
      volatilityAccumulator: buffer.readUInt32LE(offset),
      volatilityReference: buffer.readUInt32LE(offset + 4),
      indexReference: buffer.readInt32LE(offset + 8),
      padding: buffer.slice(offset + 12, offset + 16),
      lastUpdateTimestamp: readBigIntLE(buffer, offset + 16, 8).value.toString(),
      padding1: buffer.slice(offset + 24, offset + 32),
    };
    offset += 32;

    // 4) 단일 필드들
    const bump_seed = buffer.slice(offset, offset + 1); offset += 1;
    const bin_step_seed = buffer.slice(offset, offset + 2); offset += 2;
    const pair_type = buffer.readUInt8(offset); offset += 1;
    const active_id = buffer.readInt32LE(offset); offset += 4;
    const bin_step = buffer.readUInt16LE(offset); offset += 2;
    const status = buffer.readUInt8(offset); offset += 1;
    const require_base_factor_seed = buffer.readUInt8(offset); offset += 1;
    const base_factor_seed = buffer.slice(offset, offset + 2); offset += 2;
    const activation_type = buffer.readUInt8(offset); offset += 1;
    const _padding_0 = buffer.readUInt8(offset); offset += 1;

    // 5) token_x_mint, token_y_mint, reserve_x, reserve_y (각각 32바이트)
    const tokenXRes = readPublicKey(buffer, offset);
    const token_x_mint = tokenXRes.value;
    offset = tokenXRes.newOffset;
    const tokenYRes = readPublicKey(buffer, offset);
    const token_y_mint = tokenYRes.value;
    offset = tokenYRes.newOffset;
    const reserveXRes = readPublicKey(buffer, offset);
    const reserve_x = reserveXRes.value;
    offset = reserveXRes.newOffset;
    const reserveYRes = readPublicKey(buffer, offset);
    const reserve_y = reserveYRes.value;
    offset = reserveYRes.newOffset;

    // 6) protocol_fee (u64, u64)
    const amountXRes = readBigIntLE(buffer, offset, 8);
    const amount_x = amountXRes.value.toString();
    offset = amountXRes.newOffset;
    const amountYRes = readBigIntLE(buffer, offset, 8);
    const amount_y = amountYRes.value.toString();
    offset = amountYRes.newOffset;

    // 7) padding1 (32바이트)
    const _padding_1 = buffer.slice(offset, offset + 32);
    offset += 32;

    // 8) reward_infos (2개)
    const reward_infos: any[] = [];
    for (let i = 0; i < 2; i++) {
      const mintRes = readPublicKey(buffer, offset); const mint = mintRes.value; offset = mintRes.newOffset;
      const vaultRes = readPublicKey(buffer, offset); const vault = vaultRes.value; offset = vaultRes.newOffset;
      const funderRes = readPublicKey(buffer, offset); const funder = funderRes.value; offset = funderRes.newOffset;
      const rewardDurationRes = readBigIntLE(buffer, offset, 8);
      const reward_duration = rewardDurationRes.value.toString();
      offset = rewardDurationRes.newOffset;
      const rewardDurationEndRes = readBigIntLE(buffer, offset, 8);
      const reward_duration_end = rewardDurationEndRes.value.toString();
      offset = rewardDurationEndRes.newOffset;
      // u128 ⇒ 2×u64
      const highRes = readBigIntLE(buffer, offset, 8); offset = highRes.newOffset;
      const lowRes = readBigIntLE(buffer, offset, 8); offset = lowRes.newOffset;
      const reward_rate = ((highRes.value << 64n) | lowRes.value).toString();
      const lastUpdateTimeRes = readBigIntLE(buffer, offset, 8);
      const last_update_time = lastUpdateTimeRes.value.toString();
      offset = lastUpdateTimeRes.newOffset;
      const cumulativeRes = readBigIntLE(buffer, offset, 8);
      const cumulative_seconds_with_empty_liquidity_reward = cumulativeRes.value.toString();
      offset = cumulativeRes.newOffset;

      reward_infos.push({
        mint,
        vault,
        funder,
        reward_duration,
        reward_duration_end,
        reward_rate,
        last_update_time,
        cumulative_seconds_with_empty_liquidity_reward,
      });
    }

    // 9) oracle (32바이트 Pubkey)
    const oracleRes = readPublicKey(buffer, offset);
    const oracle = oracleRes.value;
    offset = oracleRes.newOffset;

    // 10) bin_array_bitmap (16×u64)
    const bin_array_bitmap: string[] = [];
    for (let i = 0; i < 16; i++) {
      const binBitmapRes = readBigIntLE(buffer, offset, 8);
      bin_array_bitmap.push(binBitmapRes.value.toString());
      offset = binBitmapRes.newOffset;
    }

    // 11) last_updated_at (i64)
    const lastUpdatedRes = readBigIntLE(buffer, offset, 8);
    const last_updated_at = lastUpdatedRes.value.toString();
    offset = lastUpdatedRes.newOffset;

    // 12) padding2 (32바이트)
    const _padding_2 = buffer.slice(offset, offset + 32);
    offset += 32;

    // 13) pre_activation_swap_address, base_key (각 32바이트)
    const preActRes = readPublicKey(buffer, offset);
    const pre_activation_swap_address = preActRes.value;
    offset = preActRes.newOffset;
    const baseKeyRes = readPublicKey(buffer, offset);
    const base_key = baseKeyRes.value;
    offset = baseKeyRes.newOffset;

    // 14) activation_point, pre_activation_duration (각 u64), padding3 (8바이트)
    const activationPointRes = readBigIntLE(buffer, offset, 8);
    const activation_point = activationPointRes.value.toString();
    offset = activationPointRes.newOffset;
    const preActDurRes = readBigIntLE(buffer, offset, 8);
    const pre_activation_duration = preActDurRes.value.toString();
    offset = preActDurRes.newOffset;
    const _padding_3 = buffer.slice(offset, offset + 8);
    offset += 8;

    // 15) padding4 (u64)
    const padding4Res = readBigIntLE(buffer, offset, 8);
    const _padding_4 = padding4Res.value.toString();
    offset = padding4Res.newOffset;

    // 16) creator (32바이트), reserved (24바이트)
    const creatorRes = readPublicKey(buffer, offset);
    const creator = creatorRes.value;
    offset = creatorRes.newOffset;
    const _reserved = buffer.slice(offset, offset + 24);
    offset += 24;

    return {
      parameters,
      v_parameters,
      bump_seed,
      bin_step_seed,
      pair_type,
      active_id,
      bin_step,
      status,
      require_base_factor_seed,
      base_factor_seed,
      activation_type,
      _padding_0,
      token_x_mint,
      token_y_mint,
      reserve_x,
      reserve_y,
      protocol_fee: { amount_x, amount_y },
      _padding_1,
      reward_infos,
      oracle,
      bin_array_bitmap,
      last_updated_at,
      _padding_2,
      pre_activation_swap_address,
      base_key,
      activation_point,
      pre_activation_duration,
      _padding_3,
      _padding_4,
      creator,
      _reserved,
    };
  } catch (error) {
    console.error('Error during DLMM pool decoding:', error);
    return null;
  }
}

export class DlmmDecoder {
  static decode(buffer: Buffer): DlmmPoolState {
    const decoded = decodeDLMMPoolData(buffer);
    if (!decoded) {
      throw new Error('DLMM pool decoding failed');
    }
    return decoded;
  }
}
