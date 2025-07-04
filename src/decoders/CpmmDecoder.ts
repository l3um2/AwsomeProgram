// src/decoders/CpmmDecoder.ts
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

export interface CpmmPoolState {
  AmmConfig: string;
  poolCreator: string;
  token0Vault: string;
  token1Vault: string;
  lpMint: string;
  token0Mint: string;
  token1Mint: string;
  token0Program: string;
  token1Program: string;
  ObservationKey: string;
  authBump: number;
  status: number;
  lpMintDecimals: number;
  mint0Decimals: number;
  mint1Decimals: number;
  lpSupply: string;
  protocolFeesToken0: string;
  protocolFeesToken1: string;
  fundFeesToken0: string;
  fundFeesToken1: string;
  openTime: string;
  recentEpoch: string;
  padding: string[];
}

export class CpmmDecoder {
  static decode(buffer: Buffer): CpmmPoolState {
    let offset = 0;
    if (buffer.length === 637) offset += 8;
    function readU8(): number { const v = buffer.readUInt8(offset); offset += 1; return v; }
    function readU64LE(): string { const v = buffer.readBigUInt64LE(offset); offset += 8; return v.toString(); }
    function readBlob(size: number): Buffer { const b = buffer.slice(offset, offset + size); offset += size; return b; }
    function readPK(): string { const pk = new PublicKey(buffer.slice(offset, offset + 32)).toBase58(); offset += 32; return pk; }
    const state: CpmmPoolState = { AmmConfig:'',poolCreator:'',token0Vault:'',token1Vault:'',lpMint:'',token0Mint:'',token1Mint:'',token0Program:'',token1Program:'',ObservationKey:'',authBump:0,status:0,lpMintDecimals:0,mint0Decimals:0,mint1Decimals:0,lpSupply:'',protocolFeesToken0:'',protocolFeesToken1:'',fundFeesToken0:'',fundFeesToken1:'',openTime:'',recentEpoch:'',padding:[] };
    state.AmmConfig = readPK();
    state.poolCreator = readPK();
    state.token0Vault = readPK();
    state.token1Vault = readPK();
    state.lpMint = readPK();
    state.token0Mint = readPK();
    state.token1Mint = readPK();
    state.token0Program = readPK();
    state.token1Program = readPK();
    state.ObservationKey = readPK();
    state.authBump = readU8();
    state.status = readU8();
    state.lpMintDecimals = readU8();
    state.mint0Decimals = readU8();
    state.mint1Decimals = readU8();
    state.lpSupply = readU64LE();
    state.protocolFeesToken0 = readU64LE();
    state.protocolFeesToken1 = readU64LE();
    state.fundFeesToken0 = readU64LE();
    state.fundFeesToken1 = readU64LE();
    state.openTime = readU64LE();
    state.recentEpoch = readU64LE();
    for (let i=0;i<31;i++) state.padding.push(readU64LE());
    return state;
  }
}