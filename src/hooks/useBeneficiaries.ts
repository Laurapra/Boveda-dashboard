// src/hooks/useBeneficiaries.ts
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";

export interface BenAccount {
  id: string;
  beneficiary_id: string;
  account_type: "Bre-B" | "Ahorros" | "Corriente";
  bank_name: string;
  account_key: string;
  is_active: boolean;
}

export interface Beneficiary {
  id: string;
  user_id: string;
  full_name: string;
  doc_type: string;
  doc_number: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  accounts: BenAccount[];
}

export function useBeneficiaries() {
  const { user } = useAuthStore();
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("beneficiaries")
      .select(`
        id, user_id, full_name, doc_type, doc_number, phone, email, created_at,
        beneficiary_accounts ( id, beneficiary_id, account_type, bank_name, account_key, is_active )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const mapped: Beneficiary[] = (data ?? []).map((b: any) => ({
      ...b,
      accounts: (b.beneficiary_accounts ?? []) as BenAccount[],
    }));
    setBeneficiaries(mapped);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { beneficiaries, loading, refetch: load };
}