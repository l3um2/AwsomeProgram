// src/decoders/OrcaDecoder.ts
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

export interface WhirlpoolState {
  whirlpoolsConfig: string;
  whirlpoolBump: number;
  OrcatickSpacing: number;
  feeTierIndexSeed: number[];
  feeRate: number;
  protocolFeeRate: number;
  liquidity: string;
  sqrtPrice: string;
  tickCurrentIndex: number;
  protocolFeeOwedA: string;
  protocolFeeOwedB: string;
  tokenMintA: string;
  tokenVaultA: string;
  feeGrowthGlobalA: string;
  tokenMintB: string;
  tokenVaultB: string;
  feeGrowthGlobalB: string;
  rewardLastUpdatedTimestamp: string;
  rewardInfos: Buffer[];
}

const NUM_REWARDS = 3;
const REWARD_INFO_SIZE = 128;

export class OrcaDecoder {
  static decode(data: Buffer): WhirlpoolState {
    let offset = 0;

    // Skip 8-byte account discriminator
    offset += 8;

    const decoded: any = {};

    function readUInt8(): number {
      const val = data.readUInt8(offset);
      offset += 1;
      return val;
    }
    function readUInt16LE(): number {
      const val = data.readUInt16LE(offset);
      offset += 2;
      return val;
    }
    function readUInt64LE(): string {
      const val = data.readBigUInt64LE(offset);
      offset += 8;
      return val.toString();
    }
    function readInt32LE(): number {
      const val = data.readInt32LE(offset);
      offset += 4;
      return val;
    }
    function readUInt128LE(): string {
      const low = data.readBigUInt64LE(offset);
      const high = data.readBigUInt64LE(offset + 8);
      const val = (high << 64n) | low;
      offset += 16;
      return val.toString();
    }
    function readPubkey(): string {
      const blob = data.slice(offset, offset + 32);
      offset += 32;
      return new PublicKey(blob).toBase58();
    }
    function readBlob(size: number): Buffer {
      const blob = data.slice(offset, offset + size);
      offset += size;
      return blob;
    }

    decoded.whirlpoolsConfig = readPubkey();
    decoded.whirlpoolBump = readUInt8();
    decoded.OrcatickSpacing = readUInt16LE();
    decoded.feeTierIndexSeed = [readUInt8(), readUInt8()];
    decoded.feeRate = readUInt16LE();
    decoded.protocolFeeRate = readUInt16LE();
    decoded.liquidity = readUInt128LE();
    decoded.sqrtPrice = readUInt128LE();
    decoded.tickCurrentIndex = readInt32LE();
    decoded.protocolFeeOwedA = readUInt64LE();
    decoded.protocolFeeOwedB = readUInt64LE();
    decoded.tokenMintA = readPubkey();
    decoded.tokenVaultA = readPubkey();
    decoded.feeGrowthGlobalA = readUInt128LE();
    decoded.tokenMintB = readPubkey();
    decoded.tokenVaultB = readPubkey();
    decoded.feeGrowthGlobalB = readUInt128LE();
    decoded.rewardLastUpdatedTimestamp = readUInt64LE();

    const rewards: Buffer[] = [];
    for (let i = 0; i < NUM_REWARDS; i++) {
      rewards.push(readBlob(REWARD_INFO_SIZE));
    }
    decoded.rewardInfos = rewards;

    return decoded as WhirlpoolState;
  }
}
