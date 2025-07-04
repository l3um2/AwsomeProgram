//src/calculators/DlmmPriceCalculator.ts
import { Connection, PublicKey } from '@solana/web3.js';
import DLMM, { SwapQuote, SwapQuoteExactOut } from '@meteora-ag/dlmm';
import { getMint, NATIVE_MINT } from '@solana/spl-token';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { PRICE_SOL_AMOUNT } from '../config';

/**
 * DLMM Pool Price Calculator
 *  - tokensReceivedPerSol: SOL→Token 방향, 1 SOL 당 받을 수 있는 토큰 수
 *  - tokensRequiredPerSol: Token→SOL 방향, 1 SOL 받기 위해 보내야 하는 토큰 수
 */
export async function calculateDlmmPrices(
  connection: Connection,
  poolAddress: PublicKey
): Promise<{ buyPrice: number; sellPrice: number }> {
  const SLIPPAGE_BPS = new BN(100); // 1% slippage
  const dlmm = await DLMM.create(connection, poolAddress, { cluster: 'mainnet-beta' });

  const xIsSol = dlmm.tokenX.publicKey.equals(NATIVE_MINT);
  const solMint = NATIVE_MINT;
  const tokenMint = xIsSol ? dlmm.tokenY.publicKey : dlmm.tokenX.publicKey;

  // decimals
    let solInfo, tokenInfo;
    try {
      [solInfo, tokenInfo] = await Promise.all([
        getMint(connection, solMint),
        getMint(connection, tokenMint),
      ]);
    } catch (err: any) {
      if (err.name === 'TokenInvalidAccountOwnerError') {
        console.warn(`[DLMM][${poolAddress.toBase58()}] invalid mint account, skipping: ${err.message}`);
        // 유효한 가격을 계산할 수 없으니 0으로 리턴하거나 호출부에서 스킵
        return { buyPrice: 0, sellPrice: 0 };
      }
      throw err;
    }
  const solDecimals = solInfo.decimals;
  const tokenDecimals = tokenInfo.decimals;

  // PRICE_SOL_AMOUNT SOL → lamports
  const desiredSol = new Decimal(PRICE_SOL_AMOUNT);
  const lamportsSol = new BN(
    desiredSol.mul(new Decimal(10).pow(solDecimals)).floor().toFixed(0)
  );

    // 1) SOL → Token (exact in)
    let buyPrice: number;
    try {
      const binArrBuy = await dlmm.getBinArrayForSwap(xIsSol);
      const quoteBuy = (await dlmm.swapQuote(
        lamportsSol,
        xIsSol,
        SLIPPAGE_BPS,
        binArrBuy,
        false,
        3
      )) as SwapQuote;
      const outAmt = new BN(quoteBuy.outAmount.toString());
      const tokensOut = new Decimal(outAmt.toString()).div(new Decimal(10).pow(tokenDecimals));
      buyPrice = Number(tokensOut.toFixed(6));
    } catch (err: any) {
      if (err.message.includes('Insufficient liquidity')) {
        console.warn(`[DLMM][${poolAddress.toBase58()}] insufficient liquidity for buy quote`);
        buyPrice = 0;
      } else {
        throw err;
      }
    }

      // 2) Token → SOL (exact out)
      let sellPrice: number;
      try {
        const binArrSell = await dlmm.getBinArrayForSwap(!xIsSol);
        const quoteSell = (await dlmm.swapQuoteExactOut(
          lamportsSol,
          !xIsSol,
          SLIPPAGE_BPS,
          binArrSell,
          3
        )) as SwapQuoteExactOut;
        const inAmt = new BN(quoteSell.inAmount.toString());
        const tokensNeeded = new Decimal(inAmt.toString()).div(new Decimal(10).pow(tokenDecimals));
        sellPrice = Number(tokensNeeded.toFixed(6));
      } catch (err: any) {
        if (err.message.includes('Insufficient liquidity')) {
          console.warn(`[DLMM][${poolAddress.toBase58()}] insufficient liquidity for sell quote`);
          sellPrice = 0;
        } else {
          throw err;
        }
      }

  return {
    buyPrice,
    sellPrice,
  };
}
