// src/decoders/ClmmDecoder.ts
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

export interface RewardInfo {
  rewardState: number;
  openTime: bigint;
  endTime: bigint;
  lastUpdateTime: bigint;
  emissionsPerSecondX64: bigint;
  rewardTotalEmissioned: bigint;
  rewardClaimed: bigint;
  tokenMint: string;
  tokenVault: string;
  authority: string;
  rewardGrowthGlobalX64: bigint;
}

export interface ClmmPoolState {
  bump: number;
  ammConfig: string;
  owner: string;
  tokenMint0: string;
  tokenMint1: string;
  tokenVault0: string;
  tokenVault1: string;
  observationKey: string;
  mintDecimals0: number;
  mintDecimals1: number;
  tickSpacing: number;
  liquidity: bigint;
  sqrtPriceX64: bigint;
  tickCurrent: number;
  feeGrowthGlobal0X64: bigint;
  feeGrowthGlobal1X64: bigint;
  protocolFeesToken0: bigint;
  protocolFeesToken1: bigint;
  swapInAmountToken0: bigint;
  swapOutAmountToken1: bigint;
  swapInAmountToken1: bigint;
  swapOutAmountToken0: bigint;
  status: number;
  rewardInfos: RewardInfo[];
}

function readU64(buffer: Buffer, offset: number): { value: bigint; newOffset: number } {
  const value = buffer.readBigUInt64LE(offset);
  return { value, newOffset: offset + 8 };
}

function readU128(buffer: Buffer, offset: number): { value: bigint; newOffset: number } {
  const lo = buffer.readBigUInt64LE(offset);
  const hi = buffer.readBigUInt64LE(offset + 8);
  return { value: lo + (hi << 64n), newOffset: offset + 16 };
}

function readPublicKey(buffer: Buffer, offset: number): { value: string; newOffset: number } {
  const key = new PublicKey(buffer.slice(offset, offset + 32)).toBase58();
  return { value: key, newOffset: offset + 32 };
}

function decodeCLMMPoolData(buffer: Buffer): ClmmPoolState {
  let offset = 8; // skip discriminator
  const d: any = {};

  d.bump = buffer.readUInt8(offset++);

  let res = readPublicKey(buffer, offset);
  d.ammConfig = res.value; offset = res.newOffset;

  res = readPublicKey(buffer, offset);
  d.owner = res.value; offset = res.newOffset;

  res = readPublicKey(buffer, offset);
  d.tokenMint0 = res.value; offset = res.newOffset;

  res = readPublicKey(buffer, offset);
  d.tokenMint1 = res.value; offset = res.newOffset;

  res = readPublicKey(buffer, offset);
  d.tokenVault0 = res.value; offset = res.newOffset;

  res = readPublicKey(buffer, offset);
  d.tokenVault1 = res.value; offset = res.newOffset;

  res = readPublicKey(buffer, offset);
  d.observationKey = res.value; offset = res.newOffset;

  d.mintDecimals0 = buffer.readUInt8(offset++);
  d.mintDecimals1 = buffer.readUInt8(offset++);

  d.tickSpacing = buffer.readUInt16LE(offset);
  offset += 2;

  let tmp128 = readU128(buffer, offset);
  d.liquidity = tmp128.value; offset = tmp128.newOffset;

  tmp128 = readU128(buffer, offset);
  d.sqrtPriceX64 = tmp128.value; offset = tmp128.newOffset;

  d.tickCurrent = buffer.readInt32LE(offset);
  offset += 8; // 4 bytes + padding

  tmp128 = readU128(buffer, offset);
  d.feeGrowthGlobal0X64 = tmp128.value; offset = tmp128.newOffset;

  tmp128 = readU128(buffer, offset);
  d.feeGrowthGlobal1X64 = tmp128.value; offset = tmp128.newOffset;

  let tmp64 = readU64(buffer, offset);
  d.protocolFeesToken0 = tmp64.value; offset = tmp64.newOffset;

  tmp64 = readU64(buffer, offset);
  d.protocolFeesToken1 = tmp64.value; offset = tmp64.newOffset;

  tmp128 = readU128(buffer, offset);
  d.swapInAmountToken0 = tmp128.value; offset = tmp128.newOffset;

  tmp128 = readU128(buffer, offset);
  d.swapOutAmountToken1 = tmp128.value; offset = tmp128.newOffset;

  tmp128 = readU128(buffer, offset);
  d.swapInAmountToken1 = tmp128.value; offset = tmp128.newOffset;

  tmp128 = readU128(buffer, offset);
  d.swapOutAmountToken0 = tmp128.value; offset = tmp128.newOffset;

  d.status = buffer.readUInt8(offset++);
  offset += 7; // padding

  // rewards
  d.rewardInfos = [];
  for (let i = 0; i < 3; i++) {
    const info: any = {};
    info.rewardState = buffer.readUInt8(offset++);
    let part = readU64(buffer, offset);
    info.openTime = part.value; offset = part.newOffset;
    part = readU64(buffer, offset);
    info.endTime = part.value; offset = part.newOffset;
    part = readU64(buffer, offset);
    info.lastUpdateTime = part.value; offset = part.newOffset;
    let part128 = readU128(buffer, offset);
    info.emissionsPerSecondX64 = part128.value; offset = part128.newOffset;
    part = readU64(buffer, offset);
    info.rewardTotalEmissioned = part.value; offset = part.newOffset;
    part = readU64(buffer, offset);
    info.rewardClaimed = part.value; offset = part.newOffset;
    let pkRes = readPublicKey(buffer, offset);
    info.tokenMint = pkRes.value; offset = pkRes.newOffset;
    pkRes = readPublicKey(buffer, offset);
    info.tokenVault = pkRes.value; offset = pkRes.newOffset;
    pkRes = readPublicKey(buffer, offset);
    info.authority = pkRes.value; offset = pkRes.newOffset;
    part128 = readU128(buffer, offset);
    info.rewardGrowthGlobalX64 = part128.value; offset = part128.newOffset;
    d.rewardInfos.push(info);
  }

  return d as ClmmPoolState;
}

export class ClmmDecoder {
  /** 버퍼만 주면 바로 디코딩 (RPC 호출 없음) */
  static decode(buffer: Buffer): ClmmPoolState {
    return decodeCLMMPoolData(buffer);
  }
}
