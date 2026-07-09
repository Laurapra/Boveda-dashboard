// src/hooks/useAdmin.ts
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { AdminUser, CreateUserInput } from "../types";

export function useAdmin() {
  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // ── Cargar todos los usuarios (solo admin) ────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("get_all_profiles");
    if (err) setError(err.message);
    else setUsers((data as AdminUser[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Crear usuario nuevo ───────────────────────────────────────
  const createUser = async (input: CreateUserInput): Promise<string | null> => {
    // 1. Crea el usuario en Supabase Auth usando el service role desde Edge Function
    const { data, error: fnErr } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email:     input.email,
        password:  input.password,
        full_name: input.full_name,
        role:      input.role,
        tarifa_recibir:  input.tarifa_recibir,
        tarifa_enviar:   input.tarifa_enviar,
        tarifa_variable: input.tarifa_variable,
      },
    });

    if (fnErr) return fnErr.message;
    if (data?.error) return data.error;

    await fetchUsers();
    return null;
  };

  // ── Actualizar tarifas de un usuario ──────────────────────────
  const updateTarifa = async (
    userId: string,
    recibir: number,
    enviar: number,
    variable: number
  ): Promise<string | null> => {
    const { error: err } = await supabase.rpc("update_user_tarifa", {
      target_user_id: userId,
      new_recibir:    recibir,
      new_enviar:     enviar,
      new_variable:   variable,
    });
    if (err) return err.message;
    await fetchUsers();
    return null;
  };

  // ── Activar / desactivar usuario ─────────────────────────────
  const toggleActive = async (userId: string, active: boolean): Promise<string | null> => {
    const { error: err } = await supabase.rpc("toggle_user_active", {
      target_user_id: userId,
      active,
    });
    if (err) return err.message;
    await fetchUsers();
    return null;
  };

  return { users, loading, error, createUser, updateTarifa, toggleActive, refetch: fetchUsers };
}