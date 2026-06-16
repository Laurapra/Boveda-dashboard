// src/hooks/useToast.ts
import { useState, useCallback } from "react";
import type { ToastItem, ToastType } from "../types";

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, title: string, message: string) => {
    const id = crypto.randomUUID(); // ID único para cada toast
    setToasts((prev) => [...prev, { id, type, title, message }]);

    // Auto-eliminar después de 3.4 segundos
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}