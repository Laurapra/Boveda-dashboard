// src/hooks/useTransactions.ts
import { useState, useEffect, useCallback } from "react";
//import { supabase } from "../lib/supabase";
import type { Transaction, PaymentMethod, TxStatus } from "../types";

interface Filters {
  method?: PaymentMethod | "";
  status?: TxStatus | "";
  query?: string;
}

// Datos de prueba — reemplaza con Supabase cuando tengas datos reales
const MOCK: Transaction[] = Array.from({ length: 8 }, (_, i) => {
  const methods: PaymentMethod[] = ["Bre-B", "Nequi", "Link"];
  const statuses: TxStatus[] = ["paid", "paid", "paid", "frozen", "pending", "failed", "held", "paid"];
  const amounts = [50000, 80000, 120000, 200000, 350000, 480000, 750000, 1200000];
  return {
    id: `TX${String(i + 1).padStart(8, "0")}`,
    method: methods[i % 3],
    payer_name: `Pagador ${i + 1} P***** G*****`,
    payer_doc: `3${i}****${1000 + i}`,
    reference: `BRB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    amount: amounts[i],
    fee: Math.round(amounts[i] * 0.012),
    status: statuses[i],
    created_at: new Date(Date.now() - i * 3600000).toISOString(),
  };
});

export function useTransactions(filters: Filters = {}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // ── Cuando tengas datos reales en Supabase, descomenta esto:
    // const { data, error } = await supabase
    //   .from("transactions")
    //   .select("*")
    //   .order("created_at", { ascending: false });
    // if (!error) setTransactions(data ?? []);

    // ── Por ahora filtra el mock en memoria:
    let rows = MOCK;
    if (filters.method) rows = rows.filter((t) => t.method === filters.method);
    if (filters.status) rows = rows.filter((t) => t.status === filters.status);
    if (filters.query) {
      const q = filters.query.toLowerCase();
      rows = rows.filter(
        (t) => t.id.toLowerCase().includes(q) || t.reference.toLowerCase().includes(q)
      );
    }

    setTransactions(rows);
    setLoading(false);
  }, [filters.method, filters.status, filters.query]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { transactions, loading, total: 3842, refetch: fetchData };
}