// src/components/ui/Input.tsx
import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  help?: string;
  prefix?: string; // símbolo antes del input, ej: "$"
}

export const Input: React.FC<InputProps> = ({ label, error, help, prefix, style, ...props }) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {label && (
        <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--t2)" }}>
          {label}
          {props.required && <span style={{ color: "var(--accent)", marginLeft: "3px" }}>*</span>}
        </label>
      )}
      <div style={{ position: "relative" }}>
        {prefix && (
          <span style={{
            position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
            color: "var(--t3)", fontWeight: 600, pointerEvents: "none",
          }}>
            {prefix}
          </span>
        )}
        <input
          style={{
            width: "100%",
            padding: prefix ? "10px 12px 10px 26px" : "10px 12px",
            border: `1px solid ${error ? "var(--error)" : "var(--border)"}`,
            borderRadius: "var(--radius-sm)",
            background: "var(--bg)", color: "var(--t1)",
            fontSize: "13.5px", outline: "none", transition: "border-color .14s, box-shadow .14s",
            ...(style ?? {}),
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "var(--accent)";
            e.target.style.boxShadow = "0 0 0 3px var(--accent-ring)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? "var(--error)" : "var(--border)";
            e.target.style.boxShadow = "none";
          }}
          {...props}
        />
      </div>
      {error && <span style={{ fontSize: "12px", color: "var(--error)" }}>{error}</span>}
      {help && !error && <span style={{ fontSize: "11.5px", color: "var(--t3)" }}>{help}</span>}
    </div>
  );
};