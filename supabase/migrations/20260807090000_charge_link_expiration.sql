-- Vencimiento de 30 minutos para links/QR de cobro generados (create_link,
-- create_qr). Se guarda el momento exacto de vencimiento en vez de
-- recalcularlo cada vez a partir de created_at, para que el frontend pueda
-- mostrar una cuenta regresiva y para que el backend lo aplique de forma
-- consistente en transaction_status y en sync_pending_charges.
ALTER TABLE bepay_transactions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
