// ============================================================
// مؤشر مركب يدمج المؤشرات السبعة في درجة واحدة (composite score)
// النطاق: من -100 (بيع قوي) إلى +100 (شراء قوي)
// ============================================================

// كل دالة فرعية ترجع درجة مساهمة (weight) + سبب (لأغراض الشفافية في السجل)
function scoreTrend(ema_short, ema_long) {
  // اتجاه EMA: تقاطع صاعد/هابط — وزن 25
  if (ema_short == null || ema_long == null) return { score: 0, reason: 'ema: بيانات ناقصة' };
  const diffPercent = ((ema_short - ema_long) / ema_long) * 100;
  const score = Math.max(-25, Math.min(25, diffPercent * 10)); // يكبّر الفرق الصغير
  return { score, reason: `ema_short ${ema_short > ema_long ? '>' : '<'} ema_long` };
}

function scoreMomentum(macd, macd_signal) {
  // زخم MACD — وزن 20
  if (macd == null || macd_signal == null) return { score: 0, reason: 'macd: بيانات ناقصة' };
  const diff = macd - macd_signal;
  const score = Math.max(-20, Math.min(20, diff * 1000)); // القيم عادة صغيرة جدًا، نكبّرها
  return { score, reason: `macd ${diff > 0 ? 'فوق' : 'تحت'} خط الإشارة` };
}

function scoreRSI(rsi) {
  // RSI — وزن 20: تشبع شرائي/بيعي + منطقة صحية
  if (rsi == null) return { score: 0, reason: 'rsi: بيانات ناقصة' };
  if (rsi < 30) return { score: 15, reason: `rsi ${rsi.toFixed(1)} تشبع بيعي (فرصة شراء محتملة)` };
  if (rsi > 70) return { score: -20, reason: `rsi ${rsi.toFixed(1)} تشبع شرائي (خطر انعكاس)` };
  if (rsi >= 45 && rsi <= 65) return { score: 12, reason: `rsi ${rsi.toFixed(1)} منطقة صحية صاعدة` };
  if (rsi < 45) return { score: -5, reason: `rsi ${rsi.toFixed(1)} ضعف نسبي` };
  return { score: 0, reason: `rsi ${rsi.toFixed(1)} محايد` };
}

function scoreBollinger(price, upper, lower) {
  // موقع السعر داخل نطاقات بولينجر — وزن 15
  if (price == null || upper == null || lower == null || upper === lower) {
    return { score: 0, reason: 'bollinger: بيانات ناقصة' };
  }
  const position = (price - lower) / (upper - lower); // 0 = عند الحد السفلي، 1 = عند العلوي
  if (position <= 0.15) return { score: 15, reason: 'السعر قرب الحد السفلي (فرصة شراء)' };
  if (position >= 0.85) return { score: -15, reason: 'السعر قرب الحد العلوي (خطر بيع)' };
  return { score: (0.5 - position) * 20, reason: 'السعر ضمن النطاق الأوسط' };
}

function scoreVolatility(atr, price) {
  // ATR كنسبة من السعر — وزن 10: يعاقب التقلب الشديد جدًا (خطر) أو شبه المنعدم (لا حركة)
  if (atr == null || !price) return { score: 0, reason: 'atr: بيانات ناقصة' };
  const atrPercent = (atr / price) * 100;
  if (atrPercent > 5) return { score: -10, reason: `تقلب مرتفع جدًا (ATR ${atrPercent.toFixed(2)}%)` };
  if (atrPercent < 0.2) return { score: -5, reason: `تقلب ضعيف جدًا (ATR ${atrPercent.toFixed(2)}%)` };
  return { score: 8, reason: `تقلب طبيعي (ATR ${atrPercent.toFixed(2)}%)` };
}

function scoreVolume(volume, avgVolume) {
  // تأكيد الحجم — وزن 10
  if (volume == null || !avgVolume) return { score: 0, reason: 'volume: بيانات ناقصة' };
  const ratio = volume / avgVolume;
  if (ratio >= 1.5) return { score: 10, reason: `حجم تداول قوي (${ratio.toFixed(2)}x المتوسط)` };
  if (ratio <= 0.5) return { score: -5, reason: `حجم تداول ضعيف (${ratio.toFixed(2)}x المتوسط)` };
  return { score: 3, reason: `حجم تداول طبيعي (${ratio.toFixed(2)}x المتوسط)` };
}

function scoreStopHunt(stopHunt) {
  // اصطياد وقف الخسارة (Stop Hunt) — وزن 30: إشارة انعكاس قوية عكس اتجاه الاختراق الوهمي
  if (!stopHunt) return { score: 0, reason: 'stop_hunt: لا يوجد' };
  if (stopHunt.type === 'bullish_sweep') return { score: 30, reason: stopHunt.note };
  if (stopHunt.type === 'bearish_sweep') return { score: -30, reason: stopHunt.note };
  return { score: 0, reason: 'stop_hunt: لا يوجد' };
}

function scoreFibonacci(price, fib) {
  // تصحيح فيبوناتشي — وزن 20: المنطقة الذهبية (0.5-0.618) هي منطقة الارتداد المفضلة
  if (!fib || price == null) return { score: 0, reason: 'fibonacci: بيانات ناقصة' };

  const { trend, levels, high, low } = fib;
  const goldenTop = Math.max(levels[0.5], levels[0.618]);
  const goldenBottom = Math.min(levels[0.5], levels[0.618]);
  const inGoldenZone = price >= goldenBottom && price <= goldenTop;
  const deepRetrace = trend === 'up' ? price < levels[0.786] : price > levels[0.786];
  const brokeExtreme = trend === 'up' ? price > high : price < low;

  if (trend === 'up') {
    if (inGoldenZone) return { score: 20, reason: 'fibonacci: ارتداد داخل المنطقة الذهبية (0.5-0.618) في اتجاه صاعد' };
    if (brokeExtreme) return { score: 10, reason: 'fibonacci: اختراق القمة السابقة (استمرار الاتجاه الصاعد)' };
    if (deepRetrace) return { score: -15, reason: 'fibonacci: تصحيح عميق تحت 0.786 (ضعف في الاتجاه الصاعد)' };
    return { score: 3, reason: 'fibonacci: ضمن نطاق التصحيح الطبيعي' };
  }

  // اتجاه هابط: نفس المنطق لكن معكوس الإشارة
  if (inGoldenZone) return { score: -20, reason: 'fibonacci: ارتداد داخل المنطقة الذهبية (0.5-0.618) في اتجاه هابط' };
  if (brokeExtreme) return { score: -10, reason: 'fibonacci: كسر القاع السابق (استمرار الاتجاه الهابط)' };
  if (deepRetrace) return { score: 15, reason: 'fibonacci: ارتداد قوي فوق 0.786 (احتمال انعكاس صاعد)' };
  return { score: -3, reason: 'fibonacci: ضمن نطاق التصحيح الطبيعي' };
}

/**
 * يدمج المؤشرات السبعة + فيبوناتشي + اكتشاف فخاخ اصطياد وقف الخسارة في درجة واحدة.
 * currentPrice و avgVolume و fib و stopHunt تُحسب في bot.js وتُمرَّر هنا.
 */
export function generateSignal(indicators, currentPrice, avgVolume, fib, stopHunt) {
  const parts = [
    scoreTrend(indicators.ema_short, indicators.ema_long),
    scoreMomentum(indicators.macd, indicators.macd_signal),
    scoreRSI(indicators.rsi),
    scoreBollinger(currentPrice, indicators.bollinger_upper, indicators.bollinger_lower),
    scoreVolatility(indicators.atr, currentPrice),
    scoreVolume(indicators.volume, avgVolume),
    scoreFibonacci(currentPrice, fib),
    scoreStopHunt(stopHunt)
  ];

  const totalScore = parts.reduce((sum, p) => sum + p.score, 0); // نطاق تقريبي: -150..+150
  const confidence = Math.min(1, Math.abs(totalScore) / 100); // تطبيع تقريبي إلى 0..1

  let type = 'hold';
  if (totalScore >= 45) type = 'buy';
  else if (totalScore <= -45) type = 'sell';

  return {
    type,
    confidence: Number(confidence.toFixed(2)),
    score: Number(totalScore.toFixed(1)),
    breakdown: parts.map(p => p.reason)
  };
}
