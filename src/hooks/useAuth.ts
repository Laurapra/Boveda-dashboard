// src/hooks/useAuth.ts
import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";

export function useAuth() {
  const store = useAuthStore();

  // Al montar cualquier componente que use este hook,
  // verifica si hay sesión activa
  useEffect(() => {
    store.loadSession();
  }, []);

  return store;
}