// src/store/authStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "../lib/supabase";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  session: boolean;
  loading: boolean;
  // Acciones
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<string | null>;
  signOut: () => Promise<void>;
  loadSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  // persist guarda el user en localStorage para no perder sesión al recargar
  persist(
    (set) => ({
      user: null,
      session: false,
      loading: true,

      signIn: async (email, password) => {
        // 1. Autenticar con Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) return error.message; // devuelve el error para mostrarlo en el form

        // 2. Cargar el perfil desde la tabla profiles
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.user.id)
          .single();

        set({ user: profile ?? null, session: true });
        return null; // null = sin errores
      },

      signUp: async (email, password, fullName) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName }, // ← el trigger lo lee de aquí
          },
        });
        if (error) return error.message;
        if (!data.user) return "No se pudo crear el usuario";

        // Ya no hacemos el insert manual — el trigger lo hace automáticamente
        // Solo cargamos el perfil que el trigger creó
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.user.id)
          .single();

        set({
          user: profile ?? {
            id: data.user.id,
            email,
            full_name: fullName,
            role: "operator",
            created_at: new Date().toISOString(),
          },
          session: true,
        });
        return null;
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, session: false });
      },

      loadSession: async () => {
        set({ loading: true });
        // Revisa si hay una sesión activa (cookie/localStorage de Supabase)
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();
          set({ user: profile ?? null, session: true });
        } else {
          set({ user: null, session: false });
        }
        set({ loading: false });
      },
    }),
    {
      name: "boveda-auth",
      // Solo persiste el user, no el loading ni las funciones
      partialize: (s) => ({ user: s.user }),
    },
  ),
);
