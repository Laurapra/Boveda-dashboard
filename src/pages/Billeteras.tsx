// src/pages/Billeteras.tsx
import React, { useState } from "react";
import { useDataStore, calcSaldo, fmtFechaHora } from "../store/dataStore";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Modal } from "../components/ui/Modal";
import type { ToastType, WalletCatalogItem } from "../types";

interface Props {
  fmt: (n: number) => string;
  onToast: (type: ToastType, title: string, msg: string) => void;
}

const WALLET_CATALOG: WalletCatalogItem = {
  divisa: "COP", tipo: "Bre-B", banco: "Ramplix",
  llave: "globalcoin@breb.co", desc: "Peso colombiano",
};

export const BilleterasView: React.FC<Props> = ({ fmt, onToast }) => {
  const { txns, wallets, addWallet } = useDataStore();
  const [detailIdx, setDetailIdx] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [doneOpen, setDoneOpen]   = useState(false);

  const saldo = calcSaldo(txns);
  const wallet = detailIdx !== null ? wallets[detailIdx] : null;

  const handleCreate = () => {
    if (!wallets.find((w) => w.divisa === "COP")) {
      addWallet(WALLET_CATALOG);
      onToast("ok", "Billetera creada", "Billetera COP · Bre-B activa");
    }
    setModalOpen(false);
    setDoneOpen(true);
  };

  const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", fontSize: "13px" };
  const thStyle: React.CSSProperties = { padding: "9px 12px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".5px", color: "var(--t3)", borderBottom: "1px solid var(--border)" };

  // Vista detalle
  if (wallet !== null && detailIdx !== null) {
    return (
      <div style={{ animation: "fadeUp .3s ease" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <button
              onClick={() => setDetailIdx(null)}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t2)", fontSize: "13px", cursor: "pointer" }}
            >
              ← Mis billeteras
            </button>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "20px", fontWeight: 700 }}>{wallet.divisa}</span>
                <StatusBadge value="Activa" />
              </div>
              <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>{wallet.tipo} · {wallet.banco}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "11px", color: "var(--t3)", marginBottom: "4px" }}>Saldo disponible</div>
            <div style={{ fontSize: "24px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(saldo)}</div>
          </div>
        </div>

        {/* Pills de datos */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "18px" }}>
          {[
            { label: "Divisa", val: wallet.desc, mono: false },
            { label: "Tipo",   val: wallet.tipo, mono: false },
            { label: "Banco",  val: wallet.banco, mono: false },
            { label: "Llave Bre-B", val: wallet.llave, mono: true },
          ].map((p) => (
            <div key={p.label} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "20px", fontSize: "12px" }}>
              <span style={{ color: "var(--t3)" }}>{p.label}</span>
              <span style={{ fontWeight: 500, fontFamily: p.mono ? "var(--mono)" : undefined }}>{p.val}</span>
              {p.mono && (
                <button
                  onClick={() => { navigator.clipboard.writeText(p.val); onToast("ok", "Copiado", p.val); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "13px", padding: 0, display: "flex" }}
                >
                  <i className="ti ti-copy" style={{ fontSize: "13px" }} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Historial */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "8px" }}>
            <i className="ti ti-history" style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: "14px", fontWeight: 600 }}>Historial transaccional</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["ID / Fecha", "Descripción", "Tipo", "Monto", "Estado", ""].map((h) => (
                    <th key={h} style={{ ...thStyle, textAlign: h === "Monto" ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elevated)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontFamily: "var(--mono)", fontSize: "11px", fontWeight: 500 }}>{t.id}</div>
                      <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "2px" }}>{fmtFechaHora(t.fecha)}</div>
                    </td>
                    <td style={{ ...tdStyle, fontSize: "12px" }}>{t.desc}</td>
                    <td style={tdStyle}><StatusBadge value={t.tipo} /></td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 500, color: t.tipo === "Recibido" ? "var(--success)" : "var(--error)", opacity: t.estado !== "Completado" ? 0.4 : 1 }}>
                      {t.tipo === "Recibido" ? "+" : "-"}{fmt(t.monto)}
                    </td>
                    <td style={tdStyle}><StatusBadge value={t.estado} /></td>
                    <td style={tdStyle}>
                      {t.estado === "Completado" && (
                        <button
                          onClick={() => onToast("info", "Comprobante", `PDF para ${t.id}`)}
                          style={{ background: "none", border: "1px solid var(--border)", borderRadius: "7px", padding: "4px 7px", cursor: "pointer", color: "var(--accent)", fontSize: "13px" }}
                          title="Descargar comprobante"
                        >
                          <i className="ti ti-file-download" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Vista grid
  return (
    <div style={{ animation: "fadeUp .3s ease" }}>
      {/* Grid de billeteras */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px", marginBottom: "16px" }}>
        {wallets.map((w, i) => (
          <div
            key={i}
            onClick={() => setDetailIdx(i)}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px", cursor: "pointer", transition: ".12s" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>{w.divisa}</div>
            <div style={{ fontSize: "11px", color: "var(--t3)" }}>{w.tipo}</div>
            <div style={{ fontSize: "18px", fontWeight: 600, margin: "8px 0 6px", fontVariantNumeric: "tabular-nums" }}>{fmt(saldo)}</div>
            <StatusBadge value="Activa" />
          </div>
        ))}

        {/* Agregar nueva */}
        <button
          onClick={() => setModalOpen(true)}
          style={{ background: "var(--elevated)", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius)", padding: "16px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "120px", transition: ".12s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.background = "var(--accent-dim)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"; (e.currentTarget as HTMLElement).style.background = "var(--elevated)"; }}
        >
          <i className="ti ti-plus" style={{ fontSize: "22px", color: "var(--t3)", marginBottom: "6px" }} />
          <span style={{ fontSize: "12px", color: "var(--t3)", fontWeight: 500 }}>Nueva billetera</span>
        </button>
      </div>

      {wallets.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--t3)" }}>
          <i className="ti ti-wallet" style={{ fontSize: "32px", display: "block", marginBottom: "12px", opacity: .3 }} />
          <div style={{ fontWeight: 600, marginBottom: "6px", color: "var(--t2)" }}>Aún no tienes billeteras</div>
          <div style={{ fontSize: "12px" }}>Crea tu primera billetera haciendo clic en + Nueva billetera</div>
        </div>
      )}

      {/* Modal nueva billetera */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nueva billetera" subtitle="Agrega una cuenta en tu portal"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} style={{ padding: "9px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--t1)", fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
            <button onClick={handleCreate} style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: "pointer" }}>
              <i className="ti ti-wallet" style={{ marginRight: "6px" }} />Crear billetera
            </button>
          </>
        }
      >
        <div style={{ padding: "14px", background: "var(--elevated)", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "var(--accent-dim)", display: "grid", placeItems: "center", color: "var(--accent)", flexShrink: 0 }}>
            <i className="ti ti-building-bank" style={{ fontSize: "20px" }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "14px" }}>Peso colombiano · COP</div>
            <div style={{ fontSize: "12px", color: "var(--t3)", marginTop: "2px" }}>Bre-B · Ramplix · globalcoin@breb.co</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 0", fontSize: "12.5px", color: "var(--t2)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px", borderRadius: "7px", fontSize: "11px", fontWeight: 600, color: "var(--accent)", background: "var(--accent-dim)" }}>Única disponible</span>
          Más divisas próximamente
        </div>
      </Modal>

      {/* Modal éxito */}
      <Modal isOpen={doneOpen} onClose={() => setDoneOpen(false)} title="¡Billetera creada!" subtitle="Tu cuenta COP · Bre-B está lista"
        footer={
          <button onClick={() => { setDoneOpen(false); setDetailIdx(0); }} style={{ padding: "9px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: "pointer" }}>
            <i className="ti ti-wallet" style={{ marginRight: "6px" }} />Ver mi billetera
          </button>
        }
      >
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--success-dim)", color: "var(--success)", display: "grid", placeItems: "center", margin: "0 auto 14px", fontSize: "24px" }}>
            <i className="ti ti-check" />
          </div>
          <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "8px" }}>Billetera COP activa</div>
          <div style={{ fontSize: "13px", color: "var(--t2)", marginBottom: "12px" }}>Llave Bre-B:</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontFamily: "var(--mono)", fontSize: "14px", fontWeight: 600, color: "var(--accent)" }}>
            globalcoin@breb.co
            <button onClick={() => { navigator.clipboard.writeText("globalcoin@breb.co"); onToast("ok", "Copiado", "globalcoin@breb.co"); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "14px" }}>
              <i className="ti ti-copy" />
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};