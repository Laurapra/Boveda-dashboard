// src/hooks/useBepayTransactions.ts
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";

export interface BepayTx {
  id: string;
  bepay_ide: string | null;
  type: "charge" | "payout";
  amount: number;
  concept: string;
  status: string;
  payment_method: string | null;
  bepay_link: string | null;
  reference: string | null;
  ben_name: string | null;
  account_type: string | null;
  bank_name: string | null;
  account_key: string | null;
  tarifa_aplicada: number | null;
  comision_total: number | null;
  created_at: string;
}

export function useBepayTransactions() {
  const { user }              = useAuthStore();
  const [txs, setTxs]         = useState<BepayTx[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTxs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("bepay_transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setTxs((data as BepayTx[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTxs(); }, [fetchTxs]);

  // Tiempo real — cuando el webhook actualiza el status
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("bepay-tx-realtime")
      .on("postgres_changes", {
        event: "*", schema: "public",
        table: "bepay_transactions",
        filter: `user_id=eq.${user.id}`,
      }, () => fetchTxs())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchTxs]);

  const saveTx = useCallback(async (data: Omit<BepayTx, "id" | "created_at">) => {
    if (!user) return null;
    const { data: inserted } = await supabase
      .from("bepay_transactions")
      .insert({ ...data, user_id: user.id })
      .select().single();
    await fetchTxs();
    return inserted;
  }, [user, fetchTxs]);

  return { txs, loading, saveTx, refetch: fetchTxs };
}