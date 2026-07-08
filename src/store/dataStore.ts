// src/store/dataStore.ts
import { create } from "zustand";
import type { Txn, Ben, Wallet } from "../types";
import { ESTADOS, TIPOS, TARIFAS } from "../types";

// ── Datos iniciales (mock) ────────────────────────────────────────
const INITIAL_TXNS: Txn[] = [
  { id:"TXN-20260701-0044", tipo:"Recibido", desc:"Héctor F. Sinisterra · Bre-B",        monto:2239163, comision:1190, estado:"Completado", fecha:new Date("2026-07-01T14:05:00"), divisa:"COP", refBancaria:"REF-BRB-8821203" },
  { id:"DSP-20260701-0031", tipo:"Enviado",  desc:"Leidy J. Bedoya · Nequi",             monto:1500000, comision:2990, total:1502990, estado:"Completado", fecha:new Date("2026-07-01T14:30:00"), divisa:"COP", benNombre:"Leidy Johana Bedoya Parra", benTipodoc:"CC", benNumdoc:"32901155", tipoCta:"Bre-B", banco:"Nequi", llave:"3214-5678-9000", refBancaria:"REF-BRB-8821047" },
  { id:"TXN-20260701-0041", tipo:"Recibido", desc:"Darío González · Dep. Electrónico",   monto:152209,  comision:1190, estado:"Completado", fecha:new Date("2026-07-01T12:18:00"), divisa:"COP", refBancaria:"REF-BRB-8821047" },
  { id:"TXN-20260701-0038", tipo:"Recibido", desc:"Nilson Silva Méndez · Bre-B",         monto:147940,  comision:1190, estado:"Completado", fecha:new Date("2026-07-01T11:50:00"), divisa:"COP", refBancaria:"REF-BRB-8820934" },
  { id:"DSP-20260630-0022", tipo:"Enviado",  desc:"Global Coin COP SAS · Bre-B",         monto:5000000, comision:7190, total:5007190, estado:"Completado", fecha:new Date("2026-06-30T16:30:00"), divisa:"COP", benNombre:"Global Coin COP SAS", benTipodoc:"NIT", benNumdoc:"9019209207", tipoCta:"Bre-B", banco:"Ramplix", llave:"globalcoin@breb.co", refBancaria:"REF-BRB-8820512" },
  { id:"TXN-20260629-0035", tipo:"Recibido", desc:"Danny A. Dorado · Dep. Electrónico",  monto:4003799, comision:1190, estado:"Completado", fecha:new Date("2026-06-29T11:22:00"), divisa:"COP", refBancaria:"REF-BRB-8820301" },
  { id:"DSP-20260629-0014", tipo:"Enviado",  desc:"Camilo Aristizabal · Davivienda",      monto:3500000, comision:0, total:3500000, estado:"Rechazado", fecha:new Date("2026-06-29T09:30:00"), divisa:"COP", benNombre:"Camilo Aristizabal Hoyos", benTipodoc:"CC", benNumdoc:"75099424", tipoCta:"Corriente", banco:"Davivienda", llave:"2310-0061-2900", refBancaria:"—" },
  { id:"TXN-20260628-0031", tipo:"Recibido", desc:"Ana M. Gómez · Bancolombia",          monto:800000,  comision:1190, estado:"Completado", fecha:new Date("2026-06-28T10:15:00"), divisa:"COP", refBancaria:"REF-BCO-7741082" },
  { id:"DSP-20260627-0011", tipo:"Enviado",  desc:"Leidy J. Bedoya · Nequi",             monto:2500000, comision:4190, total:2504190, estado:"Pendiente", fecha:new Date("2026-06-27T08:50:00"), divisa:"COP", benNombre:"Leidy Johana Bedoya Parra", benTipodoc:"CC", benNumdoc:"32901155", tipoCta:"Bre-B", banco:"Nequi", llave:"3214-5678-9000", refBancaria:"—" },
  { id:"TXN-20260626-0028", tipo:"Recibido", desc:"Carlos R. Martínez · Bre-B",          monto:6750000, comision:1190, estado:"Completado", fecha:new Date("2026-06-26T15:05:00"), divisa:"COP", refBancaria:"REF-BRB-8819847" },
];

const INITIAL_BENS: Ben[] = [
  { id:1, nombre:"Global Coin COP SAS",       tipodoc:"NIT", numdoc:"9019209207", indicativo:"+57", celular:"301 111 2222", correo:"globalcoincopsas@glcssa.com", cuentas:[{tipo:"Bre-B",banco:"Ramplix",llave:"globalcoin@breb.co",estado:"Activa"},{tipo:"Ahorros",banco:"Bancolombia",llave:"4830-0005-5400",estado:"Activa"}], vol:{d:2939615,m:2939615,a:2939615} },
  { id:2, nombre:"Leidy Johana Bedoya Parra",  tipodoc:"CC",  numdoc:"32901155",  indicativo:"+57", celular:"314 222 3344", correo:"leidy@email.com",             cuentas:[{tipo:"Ahorros",banco:"Nequi",llave:"3214-5678-9000",estado:"Activa"}],                                         vol:{d:0,m:0,a:0} },
  { id:3, nombre:"Camilo Aristizabal Hoyos",   tipodoc:"CC",  numdoc:"75099424",  indicativo:"+57", celular:"315 555 6677", correo:"camilo@email.com",            cuentas:[{tipo:"Corriente",banco:"Davivienda",llave:"2310-0061-2900",estado:"Inactiva"}],                                 vol:{d:0,m:0,a:0} },
];

// ── Utilidades de negocio ─────────────────────────────────────────
export function calcSaldo(txns: Txn[]): number {
  return txns
    .filter((t) => t.estado === ESTADOS.COMPLETADO)
    .reduce((s, t) => t.tipo === TIPOS.RECIBIDO ? s + t.monto : s - t.monto, 0);
}

export function calcComision(monto: number) {
  const variable = Math.round(monto * TARIFAS.VARIABLE_PCT);
  return { fijo: TARIFAS.CARGO_FIJO, variable, total: TARIFAS.CARGO_FIJO + variable };
}

export function genTxnId(prefijo: string, seq: number): string {
  const d = new Date();
  return `${prefijo}-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${String(seq).padStart(4,"0")}`;
}

export function fmtFechaHora(d: Date): string {
  return d.toLocaleDateString("es-CO",{day:"2-digit",month:"short",year:"numeric"})
    + " · " + d.toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",hour12:true});
}

export function iniciales(nombre: string): string {
  return nombre.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// ── Store ─────────────────────────────────────────────────────────
interface DataState {
  txns:    Txn[];
  bens:    Ben[];
  wallets: Wallet[];
  addTxn:    (txn: Txn) => void;
  addBen:    (ben: Omit<Ben, "id">) => void;
  deleteBen: (id: number) => void;
  addCuenta: (benId: number, cuenta: Ben["cuentas"][0]) => void;
  deleteCuenta: (benId: number, cuentaIdx: number) => void;
  addWallet: (wallet: Wallet) => void;
  updateBenVol: (benId: number, monto: number) => void;
}

export const useDataStore = create<DataState>()((set) => ({
  txns:    INITIAL_TXNS,
  bens:    INITIAL_BENS,
  wallets: [],

  addTxn: (txn) => set((s) => ({ txns: [txn, ...s.txns] })),

  addBen: (ben) => set((s) => ({
    bens: [...s.bens, { ...ben, id: Date.now() }],
  })),

  deleteBen: (id) => set((s) => ({
    bens: s.bens.filter((b) => b.id !== id),
  })),

  addCuenta: (benId, cuenta) => set((s) => ({
    bens: s.bens.map((b) => b.id === benId ? { ...b, cuentas: [...b.cuentas, cuenta] } : b),
  })),

  deleteCuenta: (benId, idx) => set((s) => ({
    bens: s.bens.map((b) => b.id === benId
      ? { ...b, cuentas: b.cuentas.filter((_, i) => i !== idx) }
      : b
    ),
  })),

  addWallet: (wallet) => set((s) => ({
    wallets: [...s.wallets, wallet],
  })),

  updateBenVol: (benId, monto) => set((s) => ({
    bens: s.bens.map((b) => b.id === benId
      ? { ...b, vol: { d: b.vol.d + monto, m: b.vol.m + monto, a: b.vol.a + monto } }
      : b
    ),
  })),
}));