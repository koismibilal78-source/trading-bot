import dotenv from 'dotenv';
dotenv.config();

import { fetchCandles, placeMarketBuy, placeMarketSell, getSymbolPrice } from './binanceClient.js';
import { computeIndicators, computeAvgVolume, computeFibonacci, detectStopHunt } from './indicators.js';
import { generateSignal } from './strategy.js';
import { isTradingAllowed, updateDrawdownAfterTrade, computeSmartStopLoss, checkProfitAfterFees } from './riskManager.js';
import {
  getBotSettings,
  saveIndicators,
  saveSignal,
  createDeal,
  closeDeal,
  upsertOpenPosition,
  updatePositionStopLoss,
  removeOpenPosition,
  getOpenPositions,
  addTrancheToPosition,
  logOrder,
  logEvent
} from './supabaseClient.js';

const BOT_ID = process.env.BOT_SETTINGS_ID;
const SYMBOL = process.env.SYMBOL || 'BTCUSDT';
const TIMEFRAME = process.env.TIMEFRAME || '1h';

async function runCycle() {
  const settings = await getBotSettings(BOT_ID);
  if (!settings.is_active) {
    await logEvent(BOT_ID, 'info', 'البوت متوقف (is_active = false)');
    return;
  }

  if (!(await isTradingAllowed(BOT_ID))) return;

  // 1. جلب الشموع وحساب المؤشرات
  const candles = await fetchCandles(SYMBOL, TIMEFRAME, 100);
  const indicators = computeIndicators(candles);
  await saveIndicators(BOT_ID, SYMBOL, TIMEFRAME, indicators);

  // 2. توليد إشارة عبر المؤشر المركب (7 مؤشرات + فيبوناتشي + اكتشاف فخاخ اصطياد وقف الخسارة)
  const currentPrice = await getSymbolPrice(SYMBOL);
  const avgVolume = computeAvgVolume(candles);
  const fib = computeFibonacci(candles);
  const stopHunt = detectStopHunt(candles);

  if (stopHunt) {
    await logEvent(BOT_ID, 'info', `⚠️ تم اكتشاف فخ اصطياد وقف خسارة: ${stopHunt.note}`, stopHunt);
  }

  const { type, confidence, score, breakdown } = generateSignal(indicators, currentPrice, avgVolume, fib, stopHunt);
  const signal = await saveSignal(BOT_ID, SYMBOL, type, currentPrice, confidence, {
    ...indicators,
    composite_score: score,
    fibonacci: fib,
    stop_hunt: stopHunt,
    breakdown
  });

  if (type === 'hold') {
    await logEvent(BOT_ID, 'signal_check', `إشارة: hold (الدرجة المركبة ${score}, ثقة ${confidence})`, { breakdown });
    return;
  }

  const openPositions = await getOpenPositions(BOT_ID);
  const position = openPositions[0]; // نفترض مركز واحد قيد البناء بالدفعات
  const totalTranches = settings.total_tranches || 1;
  const tranchAmount = settings.capital / totalTranches; // حجم كل دفعة بالعملة (USDT)

  // 3. تنفيذ إشارة الشراء — دفعة أولى أو دفعة إضافية على نفس المركز
  if (type === 'buy') {
    const tranchesFilled = position ? position.tranches_filled : 0;

    if (tranchesFilled >= totalTranches) {
      await logEvent(BOT_ID, 'signal_check', 'إشارة شراء لكن الدفعات الخمس مكتملة بالفعل');
    } else {
      const order = await placeMarketBuy(SYMBOL, tranchAmount);
      const filledQty = parseFloat(order.executedQty);
      const avgPrice = parseFloat(order.fills?.[0]?.price || currentPrice);
      const trancheNumber = tranchesFilled + 1;

      if (!position) {
        // الدفعة الأولى: افتح مركز وصفقة جديدين
        const { stopLoss, method, support, buffer } = computeSmartStopLoss(
          avgPrice, fib, indicators.atr, settings
        );
        if (method === 'support_based') {
          await logEvent(
            BOT_ID, 'info',
            `وقف الخسارة وُضع تحت الدعم (${support.toFixed(2)}) بهامش ${buffer.toFixed(2)} لتفادي فخاخ اصطياد وقف الخسارة`
          );
        }

        const deal = await createDeal(BOT_ID, signal.id, SYMBOL, 'buy', avgPrice, filledQty, order.orderId);
        await upsertOpenPosition({
          deal_id: deal.id,
          bot_id: BOT_ID,
          symbol: SYMBOL,
          side: 'buy',
          entry_price: avgPrice,
          current_price: avgPrice,
          quantity: filledQty,
          tranches_filled: 1,
          stop_loss: stopLoss,
          take_profit: settings.take_profit_percent
            ? avgPrice * (1 + settings.take_profit_percent / 100)
            : null
        });
        await logOrder({
          deal_id: deal.id, bot_id: BOT_ID, order_type: 'market', side: 'buy', symbol: SYMBOL,
          price: avgPrice, quantity: filledQty, status: 'filled',
          binance_order_id: String(order.orderId), binance_status: order.status, tranche_number: 1
        });
        await logEvent(BOT_ID, 'trade_executed', `دفعة 1/${totalTranches} منفذة عند ${avgPrice}`);
      } else {
        // دفعة إضافية: حدّث المركز والصفقة بمتوسط سعر جديد، وأعد حساب وقف الخسارة الذكي على المتوسط الجديد
        const { avgEntryPrice } = await addTrancheToPosition(position, avgPrice, filledQty);
        const { stopLoss } = computeSmartStopLoss(avgEntryPrice, fib, indicators.atr, settings);
        await updatePositionStopLoss(position.id, stopLoss);
        await logOrder({
          deal_id: position.deal_id, bot_id: BOT_ID, order_type: 'market', side: 'buy', symbol: SYMBOL,
          price: avgPrice, quantity: filledQty, status: 'filled',
          binance_order_id: String(order.orderId), binance_status: order.status, tranche_number: trancheNumber
        });
        await logEvent(
          BOT_ID, 'trade_executed',
          `دفعة ${trancheNumber}/${totalTranches} منفذة عند ${avgPrice} (متوسط الدخول الجديد: ${avgEntryPrice.toFixed(2)})`
        );
      }
    }
  }

  // 4. تنفيذ إشارة البيع (إغلاق كل الدفعات المتراكمة في المركز دفعة واحدة)
  if (type === 'sell' && position) {
    const feePercent = settings.fee_percent ?? 0.1;
    const feeCheck = checkProfitAfterFees(position.entry_price, currentPrice, feePercent);

    if (!feeCheck.worthSelling) {
      await logEvent(
        BOT_ID, 'signal_check',
        `إشارة بيع لكن الربح (${feeCheck.grossPercent}%) لا يغطي العمولة (${feeCheck.roundTripFeePercent}%) — الانتظار لفرصة أفضل`,
        feeCheck
      );
    } else {
      const order = await placeMarketSell(SYMBOL, position.quantity);
      const avgPrice = parseFloat(order.fills?.[0]?.price || currentPrice);

      const feeCost = (position.entry_price + avgPrice) * position.quantity * (feePercent / 100);
      const grossPnl = (avgPrice - position.entry_price) * position.quantity;
      const netPnl = grossPnl - feeCost;
      const netPnlPercent = ((avgPrice - position.entry_price) / position.entry_price) * 100 - feeCheck.roundTripFeePercent;

      await closeDeal(position.deal_id, avgPrice, netPnl, netPnlPercent, feeCost);
      await removeOpenPosition(position.deal_id);
      await updateDrawdownAfterTrade(BOT_ID, netPnl);

      await logOrder({
        deal_id: position.deal_id,
        bot_id: BOT_ID,
        order_type: 'market',
        side: 'sell',
        symbol: SYMBOL,
        price: avgPrice,
        quantity: position.quantity,
        status: 'filled',
        binance_order_id: String(order.orderId),
        binance_status: order.status
      });

      await logEvent(BOT_ID, 'trade_executed', `بيع منفذ عند ${avgPrice} (صافي الربح بعد العمولة: ${netPnl.toFixed(2)}, ${netPnlPercent.toFixed(2)}%)`);
    }
  }
}

async function main() {
  try {
    await runCycle();
    console.log('✅ اكتملت دورة التحقق/التنفيذ بنجاح');
    process.exit(0);
  } catch (err) {
    console.error('خطأ في الدورة:', err.message);
    await logEvent(BOT_ID, 'error', err.message, { stack: err.stack });
    process.exit(1);
  }
}

main();
