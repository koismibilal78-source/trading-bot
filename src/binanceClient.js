import Binance from 'binance-api-node';
import dotenv from 'dotenv';
dotenv.config();

const useTestnet = process.env.USE_TESTNET === 'true';

export const binance = Binance.default({
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET,
  // Testnet: بيئة تجريبية بأموال وهمية، منفصلة تمامًا عن الحساب الحقيقي ومفاتيحه
  ...(useTestnet && { httpBase: 'https://testnet.binance.vision' })
});

if (useTestnet) {
  console.log('⚠️  البوت متصل بـ Binance TESTNET (أموال وهمية) — وليس الحساب الحقيقي');
}

// جلب الشموع (candles) لحساب المؤشرات
export async function fetchCandles(symbol, interval, limit = 100) {
  const candles = await binance.candles({ symbol, interval, limit });
  return candles.map(c => ({
    openTime: c.openTime,
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    volume: parseFloat(c.volume)
  }));
}

// تنفيذ أمر شراء بالسوق (market buy) — quoteOrderQty = المبلغ بعملة التسعير (USDT مثلاً)
export async function placeMarketBuy(symbol, quoteOrderQty) {
  return binance.order({
    symbol,
    side: 'BUY',
    type: 'MARKET',
    quoteOrderQty
  });
}

// تنفيذ أمر بيع بالسوق (market sell) — quantity = كمية العملة الأساسية
export async function placeMarketSell(symbol, quantity) {
  return binance.order({
    symbol,
    side: 'SELL',
    type: 'MARKET',
    quantity
  });
}

export async function getSymbolPrice(symbol) {
  const prices = await binance.prices({ symbol });
  return parseFloat(prices[symbol]);
}

export async function getAccountBalance(asset) {
  const account = await binance.accountInfo();
  const balance = account.balances.find(b => b.asset === asset);
  return balance ? parseFloat(balance.free) : 0;
}
