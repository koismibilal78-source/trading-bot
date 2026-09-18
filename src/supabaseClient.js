import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---- Bot settings ----
export async function getBotSettings(botId) {
  const { data, error } = await supabase
    .from('bot_settings')
    .select('*')
    .eq('id', botId)
    .single();
  if (error) throw error;
  return data;
}

// ---- Indicators ----
export async function saveIndicators(botId, symbol, timeframe, values) {
  const { error } = await supabase.from('indicators').insert({
    bot_id: botId,
    symbol,
    timeframe,
    ...values
  });
  if (error) throw error;
}

// ---- Signals ----
export async function saveSignal(botId, symbol, signalType, price, confidence, basedOn) {
  const { data, error } = await supabase
    .from('signals')
    .insert({
      bot_id: botId,
      symbol,
      signal_type: signalType,
      price,
      confidence,
      based_on: basedOn
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- Deals ----
export async function createDeal(botId, signalId, symbol, side, entryPrice, quantity, binanceOrderId) {
  const { data, error } = await supabase
    .from('deals')
    .insert({
      bot_id: botId,
      signal_id: signalId,
      symbol,
      side,
      entry_price: entryPrice,
      quantity,
      binance_order_id: binanceOrderId,
      status: 'open',
      tranches_filled: 1
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function closeDeal(dealId, exitPrice, pnl, pnlPercent, fee) {
  const { error } = await supabase
    .from('deals')
    .update({
      exit_price: exitPrice,
      pnl,
      pnl_percent: pnlPercent,
      fee,
      status: 'closed',
      closed_at: new Date().toISOString()
    })
    .eq('id', dealId);
  if (error) throw error;
}

// ---- Open positions ----
export async function upsertOpenPosition(position) {
  const { error } = await supabase.from('open_positions').upsert(position);
  if (error) throw error;
}

export async function updatePositionStopLoss(positionId, stopLoss) {
  const { error } = await supabase
    .from('open_positions')
    .update({ stop_loss: stopLoss, updated_at: new Date().toISOString() })
    .eq('id', positionId);
  if (error) throw error;
}

export async function removeOpenPosition(dealId) {
  const { error } = await supabase.from('open_positions').delete().eq('deal_id', dealId);
  if (error) throw error;
}

export async function getOpenPositions(botId) {
  const { data, error } = await supabase
    .from('open_positions')
    .select('*')
    .eq('bot_id', botId);
  if (error) throw error;
  return data;
}

// يضيف دفعة جديدة إلى مركز مفتوح موجود (متوسط سعر الدخول + زيادة الكمية)
export async function addTrancheToPosition(position, newPrice, newQty) {
  const totalQty = position.quantity + newQty;
  const avgEntryPrice =
    (position.entry_price * position.quantity + newPrice * newQty) / totalQty;
  const tranchesFilled = position.tranches_filled + 1;

  const { error: posError } = await supabase
    .from('open_positions')
    .update({
      entry_price: avgEntryPrice,
      quantity: totalQty,
      current_price: newPrice,
      tranches_filled: tranchesFilled,
      updated_at: new Date().toISOString()
    })
    .eq('id', position.id);
  if (posError) throw posError;

  const { error: dealError } = await supabase
    .from('deals')
    .update({
      entry_price: avgEntryPrice,
      quantity: totalQty,
      tranches_filled: tranchesFilled
    })
    .eq('id', position.deal_id);
  if (dealError) throw dealError;

  return { avgEntryPrice, totalQty, tranchesFilled };
}

// ---- Order log ----
export async function logOrder(order) {
  const { error } = await supabase.from('order_log').insert(order);
  if (error) throw error;
}

// ---- Risk management ----
export async function getRiskState(botId) {
  const { data, error } = await supabase
    .from('risk_management')
    .select('*')
    .eq('bot_id', botId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function updateRiskState(botId, updates) {
  const { error } = await supabase
    .from('risk_management')
    .update(updates)
    .eq('bot_id', botId);
  if (error) throw error;
}

// ---- Execution log ----
export async function logEvent(botId, eventType, message, metadata = {}) {
  const { error } = await supabase.from('bot_execution_log').insert({
    bot_id: botId,
    event_type: eventType,
    message,
    metadata
  });
  if (error) console.error('فشل تسجيل الحدث:', error.message);
}
