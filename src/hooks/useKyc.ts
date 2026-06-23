// src/hooks/useKyc.ts
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import type { KycPersonal, KybBusiness } from "../types";

export function useKyc() {
  const { user } = useAuthStore();
  const [kyc, setKyc]       = useState<KycPersonal | null>(null);
  const [kyb, setKyb]       = useState<KybBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // ── Cargar datos existentes ──────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [kycRes, kybRes] = await Promise.all([
      supabase.from("kyc_personal").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("kyb_business").select("*").eq("user_id", user.id).maybeSingle(),
    ]);

    setKyc(kycRes.data ?? null);
    setKyb(kybRes.data ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Subir un archivo a Storage y devolver su URL ─────────────────
  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    if (!user) return null;
    setUploading(true);

    // La carpeta incluye el user_id para que la política RLS funcione
    const path = `${user.id}/${folder}/${Date.now()}_${file.name}`;

    const { error } = await supabase.storage
      .from("kyc-documents")
      .upload(path, file, { upsert: true });

    setUploading(false);

    if (error) { console.error("Upload error:", error); return null; }

    // Devuelve la URL firmada (privada, válida 1 año)
    const { data } = await supabase.storage
      .from("kyc-documents")
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    return data?.signedUrl ?? null;
  };

  // ── Guardar / actualizar KYC personal ────────────────────────────
  const saveKyc = async (data: Partial<KycPersonal>): Promise<string | null> => {
    if (!user) return "Sin sesión";

    const payload = { ...data, user_id: user.id, submitted_at: new Date().toISOString(), status: "pending" as const };

    const { error } = kyc
      ? await supabase.from("kyc_personal").update(payload).eq("user_id", user.id)
      : await supabase.from("kyc_personal").insert(payload);

    if (error) return error.message;
    await fetchData();
    return null;
  };

  // ── Guardar / actualizar KYB empresa ─────────────────────────────
  const saveKyb = async (data: Partial<KybBusiness>): Promise<string | null> => {
    if (!user) return "Sin sesión";

    const payload = { ...data, user_id: user.id, submitted_at: new Date().toISOString(), status: "pending" as const };

    const { error } = kyb
      ? await supabase.from("kyb_business").update(payload).eq("user_id", user.id)
      : await supabase.from("kyb_business").insert(payload);

    if (error) return error.message;
    await fetchData();
    return null;
  };

  return { kyc, kyb, loading, uploading, saveKyc, saveKyb, uploadFile, refetch: fetchData };
}