import { getRiskState, updateRiskState, logEvent } from './supabaseClient.js';

// يتحقق قبل كل صفقة إن كان التداول متوقفًا بسبب تجاوز حدود المخاطر
export async function isTradingAllowed(botId) {
  const risk = await getRiskState(botId);
  if (!risk) return true; // لا توجد قواعد مخاطر معرفة بعد
  if (risk.trading_paused) {
    await logEvent(botId, 'info', 'التداول متوقف حاليًا بسبب إدارة المخاطر');
    return false;
  }
  return true;
}

// يحدّث حالة السحب (drawdown) بعد إغلاق كل صفقة
export async function updateDrawdownAfterTrade(botId, pnl) {
  const risk = await getRiskState(botId);
  if (!risk) return;

  const newDrawdown = pnl < 0 ? (risk.current_drawdown || 0) + Math.abs(pnl) : risk.current_drawdown;
  const updates = { current_drawdown: newDrawdown, updated_at: new Date().toISOString() };

  if (risk.max_drawdown_percent && newDrawdown >= risk.max_drawdown_percent) {
    updates.trading_paused = true;
    await logEvent(botId, 'error', 'تم إيقاف التداول: تجاوز الحد الأقصى للسحب (drawdown)');
  }

  await updateRiskState(botId, updates);
}

// ============================================================
// يتحقق أن جني الربح يستحق التنفيذ فعليًا بعد خصم عمولة الشراء والبيع
// لا يُطبَّق على الخسارة (قطع الخسارة يجب أن يتم دائمًا بغض النظر عن العمولة)
// ============================================================
export function checkProfitAfterFees(entryPrice, exitPrice, feePercent) {
  const grossPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
  const roundTripFeePercent = feePercent * 2; // عمولة الشراء + عمولة البيع
  const netPercent = grossPercent - roundTripFeePercent;
  const isProfitAttempt = grossPercent > 0;

  return {
    grossPercent: Number(grossPercent.toFixed(4)),
    netPercent: Number(netPercent.toFixed(4)),
    roundTripFeePercent,
    // يُرفض البيع فقط إذا كان محاولة جني ربح والصافي بعد العمولة لا يتجاوز صفرًا
    worthSelling: !isProfitAttempt || netPercent > 0
  };
}

// ============================================================
// وقف خسارة ذكي: يوضع تحت منطقة الدعم (القاع) بمسافة أمان إضافية
// بدل نسبة ثابتة من سعر الدخول — لتفادي اصطياد وقف الخسارة (Stop Hunt)
// الذي يخترق الدعم بذيل قصير قبل أن يرتد السعر صعودًا
// ============================================================
export function computeSmartStopLoss(entryPrice, fib, atr, settings) {
  const fallbackStopLoss = settings.stop_loss_percent
    ? entryPrice * (1 - settings.stop_loss_percent / 100)
    : null;

  // إن لم تتوفر بيانات كافية (فيبوناتشي أو ATR)، نستخدم النسبة الثابتة من الإعدادات
  const support = fib?.low;
  if (!support || !atr) {
    return { stopLoss: fallbackStopLoss, method: 'fixed_percent' };
  }

  // هامش أمان = أكبر قيمة بين 1x ATR أو 0.5% من سعر الدعم (أيهما أبعد)
  const buffer = Math.max(atr, support * 0.005);
  let smartStopLoss = support - buffer;

  // سقف أقصى: لا تتجاوز مسافة وقف الخسارة 1.5x النسبة المحددة في الإعدادات (للتحكم بالمخاطرة)
  if (settings.stop_loss_percent) {
    const maxDistance = entryPrice * ((settings.stop_loss_percent * 1.5) / 100);
    const minAllowedPrice = entryPrice - maxDistance;
    smartStopLoss = Math.max(smartStopLoss, minAllowedPrice);
  }

  // لا يجوز أن يكون وقف الخسارة أعلى من سعر الدخول نفسه
  if (smartStopLoss >= entryPrice) {
    return { stopLoss: fallbackStopLoss, method: 'fixed_percent' };
  }

  return { stopLoss: smartStopLoss, method: 'support_based', support, buffer };
}
