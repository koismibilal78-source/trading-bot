import { RSI, MACD, EMA, BollingerBands, ATR } from 'technicalindicators';

export function computeIndicators(candles) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  const rsiValues = RSI.calculate({ period: 14, values: closes });
  const macdValues = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
  const emaShort = EMA.calculate({ period: 9, values: closes });
  const emaLong = EMA.calculate({ period: 21, values: closes });
  const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const atr = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });

  const last = arr => (arr.length ? arr[arr.length - 1] : null);
  const lastMacd = last(macdValues);
  const lastBb = last(bb);

  return {
    rsi: last(rsiValues),
    macd: lastMacd ? lastMacd.MACD : null,
    macd_signal: lastMacd ? lastMacd.signal : null,
    ema_short: last(emaShort),
    ema_long: last(emaLong),
    bollinger_upper: lastBb ? lastBb.upper : null,
    bollinger_lower: lastBb ? lastBb.lower : null,
    volume: candles.length ? candles[candles.length - 1].volume : null,
    atr: last(atr)
  };
}

// متوسط الحجم على آخر N شمعة — يُستخدم لتأكيد قوة الإشارة في المؤشر المركب
export function computeAvgVolume(candles, period = 20) {
  const recent = candles.slice(-period);
  if (!recent.length) return null;
  return recent.reduce((sum, c) => sum + c.volume, 0) / recent.length;
}

// مستويات تصحيح فيبوناتشي بناءً على أعلى/أدنى قمة وقاع خلال آخر N شمعة
export function computeFibonacci(candles, lookback = 50) {
  const recent = candles.slice(-lookback);
  if (recent.length < 2) return null;

  let highIdx = 0, lowIdx = 0;
  recent.forEach((c, i) => {
    if (c.high > recent[highIdx].high) highIdx = i;
    if (c.low < recent[lowIdx].low) lowIdx = i;
  });

  const high = recent[highIdx].high;
  const low = recent[lowIdx].low;
  const trend = lowIdx < highIdx ? 'up' : 'down'; // القاع قبل القمة = اتجاه صاعد، والعكس هابط
  const range = high - low;
  if (range <= 0) return null;

  // في الاتجاه الصاعد: level(p) ينخفض كلما زاد p (تصحيح من القمة نحو القاع)
  // في الاتجاه الهابط: level(p) يرتفع كلما زاد p (ارتداد من القاع نحو القمة)
  const level = p => (trend === 'up' ? high - range * p : low + range * p);

  return {
    high,
    low,
    trend,
    levels: {
      0.236: level(0.236),
      0.382: level(0.382),
      0.5: level(0.5),
      0.618: level(0.618),
      0.786: level(0.786)
    }
  };
}

// ============================================================
// اكتشاف فخاخ اصطياد وقف الخسارة (Stop Hunt / Liquidity Sweep)
// الفكرة: السعر يخترق قاعًا (أو قمة) سابقًا بذيل طويل (يشعل أوامر وقف الخسارة)
// ثم يغلق بسرعة داخل النطاق مرة أخرى — وهذا مؤشر ارتداد قوي بعكس اتجاه الاختراق
// ============================================================
export function detectStopHunt(candles, lookback = 20, wickBodyRatio = 1.5) {
  if (candles.length < lookback + 2) return null;

  const referenceWindow = candles.slice(-lookback - 1, -1); // يستثني الشمعة الأخيرة
  const last = candles[candles.length - 1];

  const swingLow = Math.min(...referenceWindow.map(c => c.low));
  const swingHigh = Math.max(...referenceWindow.map(c => c.high));

  const bodyTop = Math.max(last.open, last.close);
  const bodyBottom = Math.min(last.open, last.close);
  const body = Math.max(bodyTop - bodyBottom, 0.0000001); // تفادي القسمة على صفر
  const lowerWick = bodyBottom - last.low;
  const upperWick = last.high - bodyTop;

  // فخ صاعد (Bull Trap العكسي): كسر القاع بذيل طويل ثم إغلاق فوقه — احتمال ارتداد صعودًا
  const brokeLowThenRecovered = last.low < swingLow && last.close > swingLow;
  const bullishSweep = brokeLowThenRecovered && lowerWick / body >= wickBodyRatio;

  // فخ هابط: كسر القمة بذيل طويل ثم إغلاق تحتها — احتمال ارتداد هبوطًا
  const brokeHighThenRejected = last.high > swingHigh && last.close < swingHigh;
  const bearishSweep = brokeHighThenRejected && upperWick / body >= wickBodyRatio;

  if (bullishSweep) {
    return {
      type: 'bullish_sweep',
      swingLow,
      wickToBodyRatio: Number((lowerWick / body).toFixed(2)),
      note: `اختراق القاع (${swingLow.toFixed(2)}) بذيل طويل ثم ارتداد فوقه — احتمال فخ اصطياد وقف خسارة`
    };
  }
  if (bearishSweep) {
    return {
      type: 'bearish_sweep',
      swingHigh,
      wickToBodyRatio: Number((upperWick / body).toFixed(2)),
      note: `اختراق القمة (${swingHigh.toFixed(2)}) بذيل طويل ثم رفض تحتها — احتمال فخ اصطياد شراء`
    };
  }
  return null;
}
