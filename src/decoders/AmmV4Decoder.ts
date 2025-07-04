// src/decoders/AmmV4Decoder.ts
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

export interface AmmV4PoolState {
  status: string;
  nonce: string;
  maxOrder: string;
  depth: string;
  baseDecimal: number;
  quoteDecimal: number;
  state: string;
  resetFlag: string;
  minSize: string;
  volMaxCutRatio: string;
  amountWaveRatio: string;
  baseLotSize: string;
  quoteLotSize: string;
  minPriceMultiplier: string;
  maxPriceMultiplier: string;
  systemDecimalValue: string;
  minSeparateNumerator: string;
  minSeparateDenominator: string;
  tradeFeeNumerator: string;
  tradeFeeDenominator: string;
  pnlNumerator: string;
  pnlDenominator: string;
  swapFeeNumerator: string;
  swapFeeDenominator: string;
  baseNeedTakePnl: string;
  quoteNeedTakePnl: string;
  quoteTotalPnl: string;
  baseTotalPnl: string;
  poolOpenTime: string;
  padding1: string;
  padding2: string;
  orderbookToInitTime: string;
  swapBaseInAmount: string;
  swapQuoteOutAmount: string;
  swapBase2QuoteFee: string;
  swapQuoteInAmount: string;
  swapBaseOutAmount: string;
  swapQuote2BaseFee: string;
  baseVault: string;
  quoteVault: string;
  baseMint: string;
  quoteMint: string;
  lpMint: string;
  openOrders: string;
  marketId: string;
  marketProgramId: string;
  targetOrders: string;
  withdrawQueue: string;
  lpVault: string;
  owner: string;
  lpReserve: string;
  clientOrderId: string;
  recentEpoch: string;
  padding3: string;
}

export class AmmV4Decoder {
  static decode(buffer: Buffer): AmmV4PoolState {
    let offset = 0;
    function readNu64LE(): string {
      const value = buffer.readBigUInt64LE(offset);
      offset += 8;
      return value.toString();
    }
    function readBlob(size: number): Buffer {
      const blob = buffer.slice(offset, offset + size);
      offset += size;
      return blob;
    }
    function read16ByteField(fieldName: string) {
      const low = buffer.readBigUInt64LE(offset);
      const high = buffer.readBigUInt64LE(offset + 8);
      const value = (high << 64n) | low;
      offset += 16;
      (decoded as any)[fieldName] = value.toString();
    }
    function readPublicKeyField(fieldName: string) {
      const blob = buffer.slice(offset, offset + 32);
      offset += 32;
      (decoded as any)[fieldName] = new PublicKey(blob).toBase58();
    }
    const decoded: any = {};
    try {
      decoded.status = readNu64LE();
      decoded.nonce = readNu64LE();
      decoded.maxOrder = readNu64LE();
      decoded.depth = readNu64LE();
      decoded.baseDecimal = Number(readNu64LE());
      decoded.quoteDecimal = Number(readNu64LE());
      decoded.state = readNu64LE();
      decoded.resetFlag = readNu64LE();
      decoded.minSize = readNu64LE();
      decoded.volMaxCutRatio = readNu64LE();
      decoded.amountWaveRatio = readNu64LE();
      decoded.baseLotSize = readNu64LE();
      decoded.quoteLotSize = readNu64LE();
      decoded.minPriceMultiplier = readNu64LE();
      decoded.maxPriceMultiplier = readNu64LE();
      decoded.systemDecimalValue = readNu64LE();
      decoded.minSeparateNumerator = readNu64LE();
      decoded.minSeparateDenominator = readNu64LE();
      decoded.tradeFeeNumerator = readNu64LE();
      decoded.tradeFeeDenominator = readNu64LE();
      decoded.pnlNumerator = readNu64LE();
      decoded.pnlDenominator = readNu64LE();
      decoded.swapFeeNumerator = readNu64LE();
      decoded.swapFeeDenominator = readNu64LE();
      decoded.baseNeedTakePnl = readNu64LE();
      decoded.quoteNeedTakePnl = readNu64LE();
      decoded.quoteTotalPnl = readNu64LE();
      decoded.baseTotalPnl = readNu64LE();
      decoded.poolOpenTime = readNu64LE();
      decoded.padding1 = readNu64LE();
      decoded.padding2 = readNu64LE();
      decoded.orderbookToInitTime = readNu64LE();
      read16ByteField('swapBaseInAmount');
      read16ByteField('swapQuoteOutAmount');
      decoded.swapBase2QuoteFee = readNu64LE();
      read16ByteField('swapQuoteInAmount');
      read16ByteField('swapBaseOutAmount');
      decoded.swapQuote2BaseFee = readNu64LE();
      readPublicKeyField('baseVault');
      readPublicKeyField('quoteVault');
      readPublicKeyField('baseMint');
      readPublicKeyField('quoteMint');
      readPublicKeyField('lpMint');
      readPublicKeyField('openOrders');
      readPublicKeyField('marketId');
      readPublicKeyField('marketProgramId');
      readPublicKeyField('targetOrders');
      readPublicKeyField('withdrawQueue');
      readPublicKeyField('lpVault');
      readPublicKeyField('owner');
      decoded.lpReserve = readNu64LE();
      decoded.clientOrderId = readNu64LE();
      decoded.recentEpoch = readNu64LE();
      decoded.padding3 = readNu64LE();
    } catch (err) {
      console.error('AmmV4Decoder error:', err);
      throw err;
    }
    return decoded as AmmV4PoolState;
  }
}