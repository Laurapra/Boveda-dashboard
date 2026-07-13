// src/hooks/useBankAccounts.ts
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import type { BankAccount, AccountType, DocumentType } from "../types";

interface NewAccountInput {
  bankName: string;
  bankCode?: string;
  accountNumber: string;
  accountType: AccountType;
  accountHolderName: string;
  documentType: DocumentType;
  documentNumber: string;
}

export function useBankAccounts() {
  const { user } = useAuthStore();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data, error: dbError } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (dbError) setError(dbError.message);
    else setAccounts(data ?? []);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const addAccount = async (input: NewAccountInput): Promise<string | null> => {
    if (!user) return "No hay sesión activa";

    const { error: insertError } = await supabase.from("bank_accounts").insert({
      user_id: user.id,
      bank_name: input.bankName,
      bank_code: input.bankCode ?? null,
      account_number: input.accountNumber,
      account_type: input.accountType,
      account_holder_name: input.accountHolderName,
      document_type: input.documentType,
      document_number: input.documentNumber,
      is_verified: false,
      is_default: accounts.length === 0,
    });

    if (insertError) return insertError.message;

    await fetchAccounts();
    return null;
  };

  const setDefault = async (accountId: string): Promise<string | null> => {
    const { error: updateError } = await supabase
      .from("bank_accounts")
      .update({ is_default: true })
      .eq("id", accountId);

    if (updateError) return updateError.message;
    await fetchAccounts();
    return null;
  };

  const deleteAccount = async (accountId: string): Promise<string | null> => {
    const { error: deleteError } = await supabase
      .from("bank_accounts")
      .delete()
      .eq("id", accountId);

    if (deleteError) return deleteError.message;
    await fetchAccounts();
    return null;
  };

  return { accounts, loading, error, addAccount, setDefault, deleteAccount, refetch: fetchAccounts };
}