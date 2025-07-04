//src/arbitrage/priceMonitor.ts
import { EventEmitter } from 'events';
import { PriceUpdate, ArbitrageOpportunity } from './types';
import { GroupManager } from './groupManager';

export class PriceMonitor extends EventEmitter {
  private gm = new GroupManager();
  constructor(public threshold: number) { super(); }
  handlePrice(update: PriceUpdate): void {
    this.gm.addPriceUpdate(update);
    const opp = this.gm.checkArbitrage(this.threshold);
    if (opp) this.emit('arbitrage', opp);
  }
}