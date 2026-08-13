// src/pages/Movimientos.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { useBeneficiaries, type Beneficiary, type BenAccount } from "../hooks/useBeneficiaries";
import { sendPayoutBreb, sendPayoutAch, getBankCodes, lookupBrebKey } from "../lib/bepayClient";
import { TwoFactorPrompt } from "../components/TwoFactorPrompt";
import type { ToastType } from "../types";
import RamplixWordmark from "../assets/ramplix-wordmark.png";
import "./Movimientos.css";

interface Props {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

interface BepayTx {
  id: string;
  bepay_ide: string | null;
  type: "charge" | "payout";
  amount: number;
  concept: string;
  status: string;
  ben_name: string | null;
  ben_doc_type: string | null;
  ben_doc_number: string | null;
  account_type: string | null;
  bank_name: string | null;
  account_key: string | null;
  tarifa_aplicada: number | null;
  comision_total: number | null;
  reference: string | null;
  created_at: string;
}

interface BankCode {
  code: string;
  name: string;
}

interface LookupResult {
  verified: boolean;
  holderName: string | null;
  bank: string | null;
  error: string | null;
}

interface PayoutResponse {
  success: boolean;
  data?: {
    ide?: string;
    [key: string]: unknown;
  };
  error?: string;
  message?: string | Record<string, unknown>;
}

interface LookupResponse {
  success: boolean;
  data?: {
    name?: string;
    holder_name?: string;
    bank?: string;
    entity_name?: string;
    [key: string]: unknown;
  };
  error?: string;
  message?: string | Record<string, unknown>;
}

type Vista = "historial" | "nueva" | "exito";
type TipoFiltro = "" | "breb" | "ach";

// ── Helpers puros / con efectos impuros aislados fuera del componente ──
function calcComisionLocal(amount: number, fijo: number, variablePct: number) {
  const variable = Math.round(amount * variablePct);
  return { fijo, variable, total: fijo + variable };
}

function isBankAccount(accountType: string | null): boolean {
  return accountType === "Ahorros" || accountType === "Corriente";
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Error desconocido";
}

// Comparación segura de nombres de banco — nunca truena si viene null/undefined
function normalizeBankName(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase();
}

function findBankCode(bankCodes: BankCode[], bankName: string | null | undefined): BankCode | undefined {
  const target = normalizeBankName(bankName);
  if (!target) return undefined;
  return bankCodes.find((b) => normalizeBankName(b.name) === target);
}

// Bepay devuelve /payout/bankCodes como [ { "001": "BANCO DE BOGOTA", "007": "BANCOLOMBIA", ... } ]
// — un array con UN objeto donde cada llave es el código. Lo transformamos a BankCode[].
function parseBankCodes(rawData: unknown): BankCode[] {
  if (!Array.isArray(rawData) || rawData.length === 0) return [];
  const obj = rawData[0];
  if (typeof obj !== "object" || obj === null) return [];
  return Object.entries(obj as Record<string, unknown>)
    .filter(([, value]) => typeof value === "string")
    .map(([code, value]) => ({ code, name: value as string }));
}

// Estas dos funciones concentran las únicas llamadas impuras (Date.now / new Date())
// fuera del cuerpo del componente, para cumplir con la regla react-hooks/purity.
function generateReference(prefix: string): string {
  return prefix + "-" + Date.now();
}

function nowISOString(): string {
  return new Date().toISOString();
}

export const MovimientosView: React.FC<Props> = ({ fmt, onToast }) => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const { beneficiaries, loading: bensLoading, refetch: refetchBens } = useBeneficiaries();

  const [vista, setVista] = useState<Vista>("historial");
  const [txns, setTxns] = useState<BepayTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTipo, setFilterTipo] = useState<TipoFiltro>("");
  const [filterDesde, setFilterDesde] = useState("");
  const [filterHasta, setFilterHasta] = useState("");
  const [lastTxn, setLastTxn] = useState<BepayTx | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const [benQuery, setBenQuery] = useState("");
  const [showBenList, setShowBenList] = useState(false);
  const [selectedBenId, setSelectedBenId] = useState<string | null>(null);
  const [selectedCtaId, setSelectedCtaId] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [saving, setSaving] = useState(false);
  const benRef = useRef<HTMLDivElement>(null);

  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const [bankCodes, setBankCodes] = useState<BankCode[]>([]);

  const tarifaFijo = user?.tarifa_enviar ?? 1190;
  const tarifaVariable = user?.tarifa_variable ?? 0.0012;

  // Tope por dispersión Bre-B — solo aplica a ese canal, ACH se queda con el
  // límite general del servidor ($50.000.000). Mismo valor que MAX_AMOUNT_BREB
  // en bepay-payouts/index.ts; esto es solo para avisar antes de intentar
  // enviar, el bloqueo real está del lado del servidor.
  const MAX_MONTO_BREB = 12_110_000_000;
  const rawMonto = parseInt(monto.replace(/\D/g, "")) || 0;
  const comision = rawMonto > 0 ? calcComisionLocal(rawMonto, tarifaFijo, tarifaVariable) : null;
  const dispersiones = txns.filter((t) => t.type === "payout");

  const checkOnboarding = useCallback(async () => {
    if (!user) return;
    if (user.role === "admin") {
      setBlocked(null);
      return;
    }

    // maybeSingle() en vez de single(): una persona solo tiene fila en UNA de
    // las dos tablas (pn o emp), nunca ambas — con single() la consulta que
    // no tiene fila devuelve 406 (ruido en consola aunque no rompe nada,
    // porque el resultado ya se maneja con el || de abajo).
    const pnRes = await supabase.from("onboarding_pn").select("status").eq("user_id", user.id).maybeSingle();
    const empRes = await supabase.from("onboarding_emp").select("status").eq("user_id", user.id).maybeSingle();
    const ob = pnRes.data || empRes.data;

    if (!ob) {
      setBlocked("Debes completar el Onboarding antes de dispersar.");
    } else if (ob.status !== "approved") {
      if (ob.status === "pending") setBlocked("Tu onboarding está pendiente de aprobación.");
      else if (ob.status === "in_review") setBlocked("Tu onboarding está en revisión.");
      else setBlocked("Tu onboarding fue rechazado. Envía uno nuevo.");
    } else {
      setBlocked(null);
    }
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from("bepay_transactions")
      .select("id, bepay_ide, type, amount, concept, status, ben_name, ben_doc_type, ben_doc_number, account_type, bank_name, account_key, tarifa_aplicada, comision_total, reference, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (!isAdmin) q = q.eq("user_id", user.id);
    const { data } = await q;
    setTxns((data ?? []) as BepayTx[]);
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      await load();
      if (cancelled) return;
      await checkOnboarding();
    });
    return () => {
      cancelled = true;
    };
  }, [load, checkOnboarding]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("mov-rt")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bepay_transactions",
          ...(isAdmin ? {} : { filter: "user_id=eq." + user.id }),
        },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, isAdmin, load]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (benRef.current && !benRef.current.contains(e.target as Node)) setShowBenList(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  const loadBankCodes = useCallback(async () => {
    try {
      const res = await getBankCodes();
      const list = parseBankCodes(res && res.data);
      setBankCodes(list);
    } catch {
      setBankCodes([]);
    }
  }, []);

  useEffect(() => {
    if (vista !== "nueva") return;
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      await loadBankCodes();
    });
    return () => {
      cancelled = true;
    };
  }, [vista, loadBankCodes]);

  const matchingBens = beneficiaries.filter((b) => {
    const q = benQuery.toLowerCase();
    return !q || b.full_name.toLowerCase().includes(q) || b.doc_number.includes(q);
  });

  const filtered = dispersiones.filter((d) => {
    const q = query.toLowerCase();
    const matchQ =
      !q ||
      d.id.toLowerCase().includes(q) ||
      (d.ben_name || "").toLowerCase().includes(q) ||
      (d.account_key || "").toLowerCase().includes(q) ||
      (d.ben_doc_number || "").includes(q);

    // Antes comparaba d.status (el valor crudo de Bepay: APPROVED, FAILED,
    // DECLINED, CANCELLED, etc.) contra un solo valor fijo del filtro
    // ("DECLINED") — pero lo que se ve en pantalla como "Rechazado" agrupa
    // varios de esos valores (ver statusLabelFn abajo), así que casi ninguna
    // fila coincidía nunca aunque el badge dijera "Rechazado". Ahora se
    // compara contra la MISMA etiqueta que se muestra, para que el filtro
    // nunca se desincronice de lo que la persona realmente ve en la tabla.
    const matchS = !filterStatus || statusLabelFn(d.status) === filterStatus;

    const matchT =
      !filterTipo ||
      (filterTipo === "breb" && d.account_type === "Bre-B") ||
      (filterTipo === "ach" && isBankAccount(d.account_type));

    const fecha = new Date(d.created_at);
    const matchDesde = !filterDesde || fecha >= new Date(filterDesde);
    const matchHasta = !filterHasta || fecha <= new Date(filterHasta + "T23:59:59");

    return matchQ && matchS && matchT && matchDesde && matchHasta;
  });

  const selectedBen: Beneficiary | undefined = beneficiaries.find((b) => b.id === selectedBenId);
  const selectedCta: BenAccount | undefined = selectedBen
    ? selectedBen.accounts.find((c) => c.id === selectedCtaId)
    : undefined;

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(async () => {
      if (cancelled) return;

      if (!selectedCta || selectedCta.account_type !== "Bre-B") {
        setLookup(null);
        return;
      }

      setLookingUp(true);
      setLookup(null);

      try {
        const res: LookupResponse = await lookupBrebKey(selectedCta.account_key);
        if (cancelled) return;

        if (res && res.success && res.data) {
          setLookup({
            verified: true,
            holderName: res.data.name || res.data.holder_name || null,
            bank: res.data.bank || res.data.entity_name || null,
            error: null,
          });
        } else {
          const rawMsg = res && (res.error || res.message);
          const msg = typeof rawMsg === "string" ? rawMsg : rawMsg ? JSON.stringify(rawMsg) : "No se pudo verificar la llave";
          setLookup({
            verified: false,
            holderName: null,
            bank: null,
            error: msg,
          });
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setLookup({ verified: false, holderName: null, bank: null, error: getErrorMessage(err) });
      } finally {
        if (!cancelled) setLookingUp(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedCta]);

  // handleConfirmar solo valida y abre el paso de 2FA — el envío real
  // (executeSend) se dispara recién cuando TwoFactorPrompt confirma el
  // código. La verificación real que importa pasa del lado del servidor
  // (bepay-payouts exige el claim aal2 en el JWT), esto es solo el paso que
  // eleva la sesión a aal2 antes de llamar a la API.
  const [twoFAOpen, setTwoFAOpen] = useState(false);

  const handleConfirmar = () => {
    if (!selectedBen || !selectedCta || rawMonto < 1000) return;
    if (selectedCta.account_type === "Bre-B" && lookup && !lookup.verified) {
      onToast("error", "Titular no verificado", "No se pudo confirmar el titular de esta llave. Revisa el dato antes de continuar.");
      return;
    }
    if (selectedCta.account_type === "Bre-B" && rawMonto > MAX_MONTO_BREB) {
      onToast("error", "Monto máximo superado", "Una dispersión Bre-B no puede superar " + fmt(MAX_MONTO_BREB) + ".");
      return;
    }
    setTwoFAOpen(true);
  };

  const executeSend = async () => {
    setTwoFAOpen(false);
    if (!selectedBen || !selectedCta || rawMonto < 1000) return;

    setSaving(true);
    try {
      let res: PayoutResponse | undefined;
      const reference = generateReference("DISP");
      const concept = "Dispersión a " + selectedBen.full_name;

      if (selectedCta.account_type === "Bre-B") {
  res = await sendPayoutBreb(selectedCta.account_key, rawMonto, concept, reference, {
    bankName: lookup?.bank ?? undefined,
    benName: selectedBen.full_name,
    benDocType: selectedBen.doc_type,
    benDocNumber: selectedBen.doc_number,
  });
} else {
        const bankMatch = findBankCode(bankCodes, selectedCta.bank_name);
        const bankCode = bankMatch ? bankMatch.code : "";

        if (!bankCode) {
          onToast("error", "Banco no reconocido", "No se encontró el código real de " + (selectedCta.bank_name || "este banco") + " para hacer la dispersión ACH.");
          setSaving(false);
          return;
        }

        res = await sendPayoutAch({
          bank_code: bankCode,
          account_number: selectedCta.account_key,
          account_type: selectedCta.account_type === "Ahorros" ? "ahorros" : "corriente",
          document_type: selectedBen.doc_type,
          document_number: selectedBen.doc_number,
          holder_name: selectedBen.full_name,
          amount: rawMonto,
          concept,
          reference,
        });
      }

      if (res && res.success === false) {
        const rawMsg = res.error || res.message || "Inténtalo de nuevo";
        const msg = typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg);
        onToast("error", "Bepay rechazó la dispersión", msg);
        return;
      }

      onToast("ok", "Dispersión enviada", fmt(rawMonto) + " -> " + selectedBen.full_name);
      await load();

      setLastTxn({
        id: reference,
        bepay_ide: res && res.data ? res.data.ide ?? null : null,
        type: "payout",
        amount: rawMonto,
        concept,
        status: "PENDING",
        ben_name: selectedBen.full_name,
        ben_doc_type: selectedBen.doc_type,
        ben_doc_number: selectedBen.doc_number,
        account_type: selectedCta.account_type,
        bank_name: selectedCta.account_type === "Bre-B" ? (lookup?.bank ?? "Sin identificar") : selectedCta.bank_name,
        account_key: selectedCta.account_key,
        tarifa_aplicada: tarifaFijo,
        comision_total: comision ? comision.total : null,
        reference,
        created_at: nowISOString(),
      });
      setVista("exito");
    } catch (err: unknown) {
      onToast("error", "Error", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setBenQuery("");
    setSelectedBenId(null);
    setSelectedCtaId(null);
    setMonto("");
    setShowBenList(false);
    setLookup(null);
  };

  const resetFilters = () => {
    setQuery("");
    setFilterStatus("");
    setFilterTipo("");
    setFilterDesde("");
    setFilterHasta("");
  };

  // Comprobante con el mismo diseño del que ya usan (tarjeta clara con
  // De/Para/Monto/Moneda/Estado/Referencia) — solo cambia que acá los datos
  // salen de la transacción real guardada en bepay_transactions, no de Bepay
  // directamente.
  const handleDownloadReceipt = async (tx: BepayTx) => {
    try {
      const { default: jsPDF } = await import("jspdf");

      const PAGE_W = 148;
      const PAGE_H = 210;
      const CENTER = PAGE_W / 2;
      const NAVY: [number, number, number] = [30, 27, 75];
      const GRAY: [number, number, number] = [140, 140, 165];
      const BG: [number, number, number] = [238, 241, 247];
      const DOT: [number, number, number] = [205, 207, 224];

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [PAGE_W, PAGE_H] });

      // ── Fondo ──
      doc.setFillColor(...BG);
      doc.rect(0, 0, PAGE_W, PAGE_H, "F");

      // ── Título + fecha ──
      doc.setTextColor(...NAVY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text("Comprobante de envío", CENTER, 22, { align: "center" });

      const d = new Date(tx.created_at);
      const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
      let hours = d.getHours();
      const ampm = hours >= 12 ? "p. m." : "a. m.";
      hours = hours % 12 || 12;
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const fechaStr = `${d.getDate()} de ${MESES[d.getMonth()]}, ${hours}:${minutes} ${ampm}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.text(fechaStr, CENTER, 29, { align: "center" });

      // ── Monto grande ──
      const montoFmt = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tx.amount);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(29);
      doc.text(`$${montoFmt} COP`, CENTER, 43, { align: "center" });

      // ── Tarjeta blanca ──
      const cardX = 12;
      const cardW = PAGE_W - cardX * 2;
      const cardY = 56;
      const padX = 10;
      const labelX = cardX + padX;
      const valueRightX = cardX + cardW - padX;

      // Datos del beneficiario ("Para") — el tipo de cuenta y la llave/cuenta
      // se apilan igual que en el modelo, solo mostrando lo que aplique.
      const paraLines = [tx.ben_name || "—", tx.account_type || null, tx.bank_name || null];
      if (tx.account_key) {
        const isBreb = tx.account_type === "Bre-B";
        paraLines.push(isBreb && !tx.account_key.startsWith("@") ? `@${tx.account_key}` : tx.account_key);
      }
      const paraLinesFiltered = paraLines.filter((l): l is string => !!l);

      const senderName = user?.full_name || "—";
      const estadoLbl = statusLabelFn(tx.status);
      const referencia = tx.reference || tx.bepay_ide || tx.id;

      // Alto dinámico según cuántas líneas tenga "Para" — se calcula contando
      // las mismas filas y separadores que se van a dibujar abajo, para que
      // la tarjeta nunca quede corta ni con espacio de más.
      const rowH = 7.2;
      const sectionGap = 5;
      const topPad = 11;
      const bottomPad = 7;
      const rowsCount = 1 /* De */ + paraLinesFiltered.length /* Para */ + 2 /* Monto, Moneda */ + 1 /* Estado */ + 1 /* Referencia */;
      const gapsCount = 4; // separadores: De|Para, Para|Monto, Monto|Estado, Estado|Referencia
      const cardH = topPad + bottomPad + rowH * rowsCount + sectionGap * gapsCount;

      doc.setFillColor(255, 255, 255);
      doc.roundedRect(cardX, cardY, cardW, cardH, 3, 3, "F");

      let y = cardY + topPad;

      const drawLabel = (label: string, atY: number) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...GRAY);
        doc.text(label, labelX, atY);
      };
      const drawValue = (value: string, atY: number) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...NAVY);
        doc.text(value, valueRightX, atY, { align: "right" });
      };
      const drawDots = (atY: number) => {
        doc.setDrawColor(...DOT);
        doc.setLineDashPattern([0.6, 1], 0);
        doc.line(labelX, atY, valueRightX, atY);
        doc.setLineDashPattern([], 0);
      };

      // De
      drawLabel("De", y);
      drawValue(senderName, y);
      y += rowH;
      drawDots(y - rowH / 2 + 2);
      y += sectionGap;

      // Para — el label solo va junto a la primera línea, el resto se apila
      drawLabel("Para", y);
      paraLinesFiltered.forEach((line, i) => drawValue(line, y + rowH * i));
      y += rowH * paraLinesFiltered.length;
      drawDots(y - rowH / 2 + 2);
      y += sectionGap;

      // Monto / Moneda
      drawLabel("Monto", y);
      drawValue(new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tx.amount), y);
      y += rowH;
      drawLabel("Moneda", y);
      drawValue("COP", y);
      y += rowH;
      drawDots(y - rowH / 2 + 2);
      y += sectionGap;

      // Estado
      drawLabel("Estado", y);
      drawValue(estadoLbl, y);
      y += rowH;
      drawDots(y - rowH / 2 + 2);
      y += sectionGap;

      // Referencia
      drawLabel("Referencia", y);
      drawValue(referencia, y);

      // ── Logo Ramplix (pájaro + línea + wordmark, un solo PNG con fondo
      // transparente para que se vea limpio sobre el fondo lila) ──
      const logoY = cardY + cardH + 16;
      try {
        const logoResp = await fetch(RamplixWordmark);
        const logoBlob = await logoResp.blob();
        const logoDataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(logoBlob);
        });
        const imgH = 11;
        const imgW = imgH * (422 / 110); // proporción real del PNG
        doc.addImage(logoDataUrl, "PNG", CENTER - imgW / 2, logoY - 8, imgW, imgH);
      } catch {
        // Si falla la carga del logo (offline, CORS, etc.) se sigue sin él —
        // el comprobante no debe fallar por esto.
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(...NAVY);
        doc.text("RAMPLIX", CENTER, logoY, { align: "center" });
      }

      // ── Footer ──
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text("Pago procesado por BE MOVIL", CENTER, logoY + 14, { align: "center" });
      doc.text("Este comprobante fue generado automáticamente por RAMPLIX", CENTER, logoY + 19, { align: "center" });

      doc.save("comprobante-" + (tx.bepay_ide || tx.id).slice(0, 12) + ".pdf");
      onToast("ok", "Comprobante generado", "Descarga completada");
    } catch (err: unknown) {
      onToast("error", "Error al generar comprobante", getErrorMessage(err));
    }
  };

  const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", fontSize: "13px" };
  const thStyle: React.CSSProperties = { padding: "9px 12px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--t3)", borderBottom: "1px solid var(--border)", textAlign: "left" };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--t1)", fontSize: "13.5px", outline: "none" };

  // Mismas palabras clave que _shared/balance.ts (isRejectedStatus) — Bepay
  // no documenta todos los nombres de estado que puede mandar (DECLINED,
  // FAILED, REJECTED, CANCELLED, etc.), así que se agrupan por palabra clave
  // en vez de una lista cerrada. Antes solo reconocía DECLINED/FAILED, por
  // eso un estado real como "REJECTED" se mostraba crudo en vez de
  // "Rechazado" y no coincidía con el filtro.
  const REJECTED_KEYWORDS = ["REJECT", "FAIL", "CANCEL", "DENIED", "ERROR", "DECLIN", "RECHAZ"];
  function isRejectedLabel(s: string) {
    const up = (s ?? "").toUpperCase();
    return REJECTED_KEYWORDS.some((k) => up.includes(k));
  }
  function statusLabelFn(s: string) {
    if (s === "APPROVED" || s === "COMPLETED") return "Completado";
    if (s === "PENDING") return "Pendiente";
    if (isRejectedLabel(s)) return "Rechazado";
    return s;
  }
  function statusColorFn(s: string) {
    if (s === "APPROVED" || s === "COMPLETED") return "var(--success)";
    if (s === "PENDING") return "var(--warning)";
    return "var(--error)";
  }
  function statusBgFn(s: string) {
    if (s === "APPROVED" || s === "COMPLETED") return "var(--success-dim)";
    if (s === "PENDING") return "var(--warning-dim)";
    return "var(--error-dim)";
  }

  if (vista === "exito" && lastTxn) {
    return (
      <div style={{ animation: "fadeUp .3s ease", maxWidth: "520px", margin: "0 auto" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "32px", textAlign: "center", boxShadow: "var(--shadow)" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "var(--success-dim)", color: "var(--success)", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: "26px" }}>
            <i className="ti ti-circle-check" />
          </div>
          <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px", color: "var(--t1)" }}>Dispersión enviada</div>
          <div style={{ fontSize: "13px", color: "var(--t3)", marginBottom: "24px" }}>{lastTxn.bepay_ide || lastTxn.id}</div>

          <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "16px", textAlign: "left", marginBottom: "20px" }}>
            {[
              ["Beneficiario", lastTxn.ben_name || "—"],
              ["Documento", (lastTxn.ben_doc_type || "") + " · " + (lastTxn.ben_doc_number || "")],
              ["Tipo de cuenta", lastTxn.account_type || "—"],
              ["Banco", lastTxn.bank_name || "—"],
              ["Llave / Número", lastTxn.account_key || "—"],
            ].map((row) => (
              <div key={row[0]} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: "13px" }}>
                <span style={{ color: "var(--t3)" }}>{row[0]}</span>
                <span style={{ fontWeight: 500 }}>{row[1]}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px", fontSize: "16px", fontWeight: 700 }}>
              <span style={{ color: "var(--t2)" }}>Total debitado</span>
              <span style={{ color: "var(--error)" }}>{fmt(lastTxn.amount + (lastTxn.comision_total || 0))}</span>
            </div>
            {lastTxn.comision_total ? (
              <div style={{ fontSize: "12px", color: "var(--t3)" }}>
                {fmt(lastTxn.amount)} + comisión {fmt(lastTxn.comision_total)}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => handleDownloadReceipt(lastTxn)}
              style={{ flex: 1, padding: "10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}
            >
              <i className="ti ti-file-download" />
              Comprobante
            </button>
            <button
              onClick={() => {
                resetForm();
                setVista("historial");
              }}
              style={{ flex: 1, padding: "10px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
            >
              Ver historial
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (vista === "nueva") {
    return (
      <div style={{ animation: "fadeUp .3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
          <button
            onClick={() => {
              resetForm();
              setVista("historial");
            }}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "13px", cursor: "pointer" }}
          >
            ← Volver al historial
          </button>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--t1)" }}>Nueva dispersión</div>
            <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "1px" }}>Completa los datos y confirma</div>
          </div>
        </div>

        {blocked ? (
          <div style={{ padding: "14px 16px", background: "var(--warning-dim)", border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)", fontSize: "13px", color: "var(--warning)", marginBottom: "16px" }}>
            {blocked}
          </div>
        ) : null}

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", boxShadow: "var(--shadow)", opacity: blocked ? 0.5 : 1, pointerEvents: blocked ? "none" : "auto" }}>
          <div style={{ marginBottom: "16px", position: "relative" }} ref={benRef}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "7px" }}>
              Beneficiario <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            {selectedBen ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px solid var(--success)", borderRadius: "var(--radius-sm)", background: "var(--success-dim)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--t1)" }}>{selectedBen.full_name}</div>
                  <div style={{ fontSize: "12px", color: "var(--t3)" }}>
                    {selectedBen.doc_type} · {selectedBen.doc_number}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedBenId(null);
                    setSelectedCtaId(null);
                    setBenQuery("");
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "12px", cursor: "pointer" }}
                >
                  <i className="ti ti-x" /> Cambiar
                </button>
              </div>
            ) : (
              <React.Fragment>
                <input
                  value={benQuery}
                  onChange={(e) => setBenQuery(e.target.value)}
                  onFocus={() => setShowBenList(true)}
                  placeholder={bensLoading ? "Cargando beneficiarios..." : "Buscar por nombre o documento..."}
                  style={inputStyle}
                  disabled={bensLoading}
                />
                {showBenList ? (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--accent-ring)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow)", zIndex: 50, maxHeight: "200px", overflowY: "auto", marginTop: "3px" }}>
                    {matchingBens.length === 0 ? (
                      <div style={{ padding: "12px 14px", fontSize: "12px", color: "var(--t3)" }}>
                        {beneficiaries.length === 0 ? "No tienes beneficiarios. Crea uno en la sección Beneficiarios." : "Sin resultados"}
                      </div>
                    ) : (
                      matchingBens.map((b) => (
                        <div
                          key={b.id}
                          onClick={() => {
                            setSelectedBenId(b.id);
                            setSelectedCtaId(null);
                            setShowBenList(false);
                            setBenQuery("");
                          }}
                          style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: "12px" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <div style={{ fontWeight: 500, color: "var(--t1)" }}>{b.full_name}</div>
                          <div style={{ color: "var(--t3)", marginTop: "2px" }}>
                            {b.doc_type} · {b.doc_number} · {b.accounts.length} cuenta(s)
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </React.Fragment>
            )}
          </div>

          {selectedBen ? (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "7px" }}>
                Cuenta destino <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              {selectedBen.accounts.length === 0 ? (
                <div style={{ padding: "10px 14px", background: "var(--warning-dim)", border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--warning)" }}>
                  Este beneficiario no tiene cuentas registradas. Agrégale una en Beneficiarios.
                </div>
              ) : (
                <select value={selectedCtaId || ""} onChange={(e) => setSelectedCtaId(e.target.value || null)} style={inputStyle}>
                  <option value="">Selecciona la cuenta...</option>
                  {selectedBen.accounts.map((c) => {
                    const label = c.account_type === "Bre-B" ? "Bre-B · " + c.account_key : c.account_type + " · " + (c.bank_name || "sin banco") + " · " + c.account_key;
                    return (
                      <option key={c.id} value={c.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              )}

              {selectedCta ? (
  <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
    {(
      selectedCta.account_type === "Bre-B"
        ? [
            ["Tipo", selectedCta.account_type],
            ["Llave", selectedCta.account_key],
          ]
        : [
            ["Tipo", selectedCta.account_type],
            ["Banco", selectedCta.bank_name || "sin definir"],
            ["Número", selectedCta.account_key],
          ]
    ).map((row) => (
      <div key={row[0]} style={{ padding: "5px 10px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "20px", fontSize: "12px" }}>
        <span style={{ color: "var(--t3)" }}>{row[0]}:</span> <span style={{ fontWeight: 500, fontFamily: row[0] === "Llave" || row[0] === "Número" ? "var(--mono)" : undefined }}>{row[1]}</span>
      </div>
    ))}
  </div>
) : null}

              {selectedCta && selectedCta.account_type === "Bre-B" ? (
                <div style={{ marginTop: "10px" }}>
                  {lookingUp ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--t2)" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                        <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                      </svg>
                      Verificando titular de la llave...
                    </div>
                  ) : lookup && lookup.verified ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "var(--success-dim)", border: "1px solid var(--success)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--success)" }}>
                      <i className="ti ti-shield-check" style={{ fontSize: "16px" }} />
                      <div>
                        Titular verificado: <b>{lookup.holderName || "Confirmado por Bepay"}</b>
                        {lookup.bank ? <span> · {lookup.bank}</span> : null}
                      </div>
                    </div>
                  ) : lookup && !lookup.verified ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "var(--error-dim)", border: "1px solid var(--error)", borderRadius: "var(--radius-sm)", fontSize: "12.5px", color: "var(--error)" }}>
                      <i className="ti ti-alert-triangle" style={{ fontSize: "16px" }} />
                      No se pudo verificar el titular: {lookup.error}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedCta && isBankAccount(selectedCta.account_type) && bankCodes.length > 0
                ? (() => {
                    const bankMatch = findBankCode(bankCodes, selectedCta.bank_name);
                    if (!bankMatch) {
                      return (
                        <div style={{ marginTop: "8px", padding: "8px 12px", background: "var(--error-dim)", border: "1px solid var(--error)", borderRadius: "var(--radius-sm)", fontSize: "12px", color: "var(--error)" }}>
                          No se encontró el código real del banco "{selectedCta.bank_name || "sin definir"}" en Bepay. La dispersión ACH podría fallar.
                        </div>
                      );
                    }
                    return (
                      <div style={{ marginTop: "8px", padding: "6px 12px", background: "var(--success-dim)", border: "1px solid var(--success)", borderRadius: "var(--radius-sm)", fontSize: "12px", color: "var(--success)" }}>
                        ✓ Banco identificado — código Bepay: {bankMatch.code}
                      </div>
                    );
                  })()
                : null}
            </div>
          ) : null}

          {selectedCta ? (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--t3)", marginBottom: "7px" }}>
                Monto <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--t3)", fontWeight: 600 }}>$</span>
                <input
                  value={monto}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, "");
                    setMonto(clean ? Number(clean).toLocaleString("es-CO") : "");
                  }}
                  placeholder="0"
                  inputMode="numeric"
                  style={{ ...inputStyle, paddingLeft: "26px" }}
                />
              </div>
              {selectedCta.account_type === "Bre-B" && rawMonto > MAX_MONTO_BREB ? (
                <div style={{ fontSize: "11px", color: "var(--error)", marginTop: "6px" }}>
                  Una dispersión Bre-B no puede superar {fmt(MAX_MONTO_BREB)}.
                </div>
              ) : null}
            </div>
          ) : null}

          {comision && rawMonto > 0 ? (
            <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "14px 16px", marginBottom: "16px" }}>
              {[
                ["Monto a enviar", fmt(rawMonto)],
                ["Cargo fijo", fmt(comision.fijo)],
                ["Variable", fmt(comision.variable)],
                ["Total comisión", fmt(comision.total)],
              ].map((row) => (
                <div key={row[0]} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "13px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--t3)" }}>{row[0]}</span>
                  <span style={{ fontWeight: 500, color: "var(--t1)" }}>{row[1]}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: "15px", fontWeight: 700 }}>
                <span style={{ color: "var(--t2)" }}>Total a débitar</span>
                <span style={{ color: "var(--error)" }}>{fmt(rawMonto + comision.total)}</span>
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              onClick={() => {
                resetForm();
                setVista("historial");
              }}
              style={{ padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontWeight: 600, cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={
                !selectedBen ||
                !selectedCta ||
                rawMonto < 1000 ||
                saving ||
                (selectedCta !== undefined && selectedCta.account_type === "Bre-B" && (lookingUp || (lookup !== null && !lookup.verified) || rawMonto > MAX_MONTO_BREB))
              }
              style={{
                padding: "9px 16px",
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontWeight: 600,
                cursor: !selectedBen || !selectedCta || rawMonto < 1000 || saving ? "not-allowed" : "pointer",
                opacity: !selectedBen || !selectedCta || rawMonto < 1000 || saving ? 0.5 : 1,
              }}
            >
              {saving ? "Enviando..." : "Confirmar dispersión"}
            </button>
          </div>
        </div>

        <TwoFactorPrompt
          isOpen={twoFAOpen}
          onClose={() => setTwoFAOpen(false)}
          onVerified={executeSend}
        />
      </div>
    );
  }

  const hasActiveFilters = query || filterStatus || filterTipo || filterDesde || filterHasta;

  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "18px" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--t1)" }}>Registros de Dispersiones</div>
          <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>{dispersiones.length} registro(s)</div>
        </div>
        <button
          onClick={() => {
            resetForm();
            setVista("nueva");
            refetchBens();
          }}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
        >
          <i className="ti ti-send" />
          Dispersar
        </button>
      </div>

      <div className="mov-filters">
        <div className="mov-filters__row mov-filters__row--top">
          <div className="mov-filters__search">
            <i className="ti ti-search mov-filters__searchIcon" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por ID, beneficiario o cuenta..." style={{ ...inputStyle, paddingLeft: "30px" }} />
          </div>
          <div className="mov-filters__field">
            <label htmlFor="mov-filter-status">Estado</label>
            <select id="mov-filter-status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="Completado">Completado</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Rechazado">Rechazado</option>
            </select>
          </div>
          <div className="mov-filters__field">
            <label htmlFor="mov-filter-tipo">Tipo</label>
            <select id="mov-filter-tipo" value={filterTipo} onChange={(e) => setFilterTipo(e.target.value as TipoFiltro)}>
              <option value="">Todos los tipos</option>
              <option value="breb">Bre-B</option>
              <option value="ach">Cuenta bancaria</option>
            </select>
          </div>
        </div>
        <div className="mov-filters__row mov-filters__row--dates">
          <div className="mov-filters__field">
            <label htmlFor="mov-filter-desde">Desde</label>
            <input id="mov-filter-desde" type="date" value={filterDesde} onChange={(e) => setFilterDesde(e.target.value)} />
          </div>
          <div className="mov-filters__field">
            <label htmlFor="mov-filter-hasta">Hasta</label>
            <input id="mov-filter-hasta" type="date" value={filterHasta} onChange={(e) => setFilterHasta(e.target.value)} />
          </div>
          <div className="mov-filters__actions">
            {hasActiveFilters ? (
              <button type="button" onClick={resetFilters}>
                Limpiar filtros
              </button>
            ) : null}
            <button type="button" onClick={load} aria-label="Actualizar">
              <i className="ti ti-refresh" />
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--t3)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
            </svg>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "44px", color: "var(--t3)" }}>
            <i className="ti ti-send" style={{ fontSize: "28px", display: "block", marginBottom: "10px", opacity: 0.3 }} />
            {dispersiones.length === 0 ? "Aún no hay dispersiones. Haz clic en Dispersar para comenzar." : "Sin resultados para los filtros aplicados."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Fecha", "Estado", "Beneficiario", "Cuenta", "Banco", "Monto", "Comisión", ""].map((h) => (
                    <th key={h} style={{ ...thStyle, textAlign: h === "Monto" || h === "Comisión" ? "right" : "left" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td style={tdStyle}>
                      <div style={{ fontSize: "12px", color: "var(--t1)" }}>{new Date(d.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}</div>
                      <div style={{ fontSize: "10px", color: "var(--t3)" }}>{new Date(d.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 500, color: statusColorFn(d.status), background: statusBgFn(d.status) }}>
                        {statusLabelFn(d.status)}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 500, color: "var(--t1)" }}>{d.ben_name || "—"}</td>
                    <td style={tdStyle}>{d.account_type || "—"}</td>
                    <td style={{ ...tdStyle, fontSize: "12px", color: "var(--t2)" }}>{d.bank_name || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "var(--error)", fontVariantNumeric: "tabular-nums" }}>{fmt(d.amount)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", color: "var(--t3)", fontVariantNumeric: "tabular-nums" }}>{d.comision_total ? fmt(d.comision_total) : "—"}</td>
                    <td style={tdStyle}>
                      {d.status === "APPROVED" || d.status === "COMPLETED" ? (
                        <button
                          onClick={() => handleDownloadReceipt(d)}
                          style={{ background: "none", border: "1px solid var(--border)", borderRadius: "7px", padding: "4px 7px", cursor: "pointer", color: "var(--accent)", fontSize: "13px" }}
                          title="Descargar comprobante"
                        >
                          <i className="ti ti-file-download" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};