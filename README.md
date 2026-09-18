# Binance Spot Trading Bot + Supabase

## التثبيت
```bash
npm install
cp .env.example .env
# ثم املأ .env بمفاتيحك الحقيقية (لا ترفعه أبدًا إلى Git)
```

## متطلبات مسبقة
1. أنشئ جداول Supabase (bot_settings, indicators, signals, deals, open_positions, order_log, risk_management, bot_execution_log).
2. أضف صفًا واحدًا على الأقل في `bot_settings` وانسخ الـ `id` الخاص به إلى `BOT_SETTINGS_ID` في `.env`.
3. تأكد أن مفتاح Binance API لديه صلاحية **Enable Spot & Margin Trading** فقط (بدون سحب/Withdraw).

## الوضع التجريبي (Testnet) — مهم قبل التشغيل بأموال حقيقية
البوت يدعم الاتصال بـ **Binance Spot Testnet** (بيئة منفصلة تمامًا بأموال وهمية):
1. اذهب إلى https://testnet.binance.vision وسجّل دخول بحساب GitHub لإنشاء مفاتيح API تجريبية
2. في `.env` ضع `USE_TESTNET=true` وضع مفاتيح الـ Testnet في `BINANCE_API_KEY` / `BINANCE_API_SECRET`
3. شغّل البوت كالمعتاد — سترى رسالة تأكيد "متصل بـ Binance TESTNET" عند بدء التشغيل
4. عندما تصبح جاهزًا للتشغيل الحقيقي: غيّر `USE_TESTNET=false` وضع مفاتيح حسابك الفعلي

## التشغيل
```bash
npm start
```

## 🚀 التشغيل المجاني الدائم عبر GitHub Actions (بدون سيرفر، من الجوال)
البوت مُعدّ ليعمل كـ"دورة واحدة تنفّذ وتخرج" (وليس حلقة دائمة)، بحيث يشغّله GitHub Actions تلقائيًا كل 15 دقيقة **مجانًا بالكامل** بدون أي اشتراك:

1. **أنشئ حساب GitHub** (إن لم يكن عندك) من github.com عبر متصفح الجوال
2. أنشئ **مستودع (Repository) جديد**، خاص (Private)، وارفع فيه كل ملفات هذا المشروع (بما فيها مجلد `.github` المخفي — تأكد أنه ظهر بعد الرفع)
3. من صفحة المستودع: **Settings → Secrets and variables → Actions → New repository secret**، وأضف كل قيمة من `.env` كـ Secret منفصل بنفس الاسم:
   - `USE_TESTNET`, `BINANCE_API_KEY`, `BINANCE_API_SECRET`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `BOT_SETTINGS_ID`, `SYMBOL`, `TIMEFRAME`
4. اذهب لتبويب **Actions** في المستودع، وفعّل الـ Workflow إذا طلب منك ذلك
5. للتجربة الفورية: من نفس تبويب Actions، اختر "Trading Bot" ثم **"Run workflow"** لتشغيله يدويًا أول مرة والتأكد أنه يعمل
6. بعدها سيعمل تلقائيًا كل 15 دقيقة إلى الأبد، مجانًا — تقدر تتابع النتائج من تبويب Actions (سجل كل تشغيل) أو من جدول `bot_execution_log` في Supabase

**ملاحظة:** لا تضع أي مفتاح API مباشرة في الكود أو ترفعه في ملف — استخدم Secrets فقط كما بالأعلى.

## بنية المشروع
- `src/binanceClient.js` — الاتصال بـ Binance (شموع، أسعار، تنفيذ أوامر)
- `src/supabaseClient.js` — كل عمليات القراءة/الكتابة في Supabase
- `src/indicators.js` — حساب المؤشرات (RSI, MACD, EMA, Bollinger, ATR)
- `src/strategy.js` — منطق توليد الإشارة (قابل للتعديل)
- `src/riskManager.js` — التحقق من حدود المخاطر قبل كل صفقة
- `src/bot.js` — الحلقة الرئيسية

## ⚠️ أمان
- لا تخزّن `BINANCE_API_SECRET` أو `SUPABASE_SERVICE_ROLE_KEY` في أي مكان عام.
- استراتيجية `strategy.js` مبسّطة جدًا لأغراض التوضيح — اختبرها جيدًا في وضع Testnet قبل استخدام أموال حقيقية.
- Binance يوفر بيئة اختبار (Testnet): https://testnet.binance.vision
