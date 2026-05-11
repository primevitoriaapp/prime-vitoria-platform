"use client";

import { FormEvent, useMemo, useState } from "react";

interface FieldDefinition {
  key: string;
  label: string;
  type?: "text" | "email" | "number" | "datetime-local";
  required?: boolean;
}

interface EntityCrudPanelProps {
  title: string;
  endpoint: string;
  fields: FieldDefinition[];
}

export function EntityCrudPanel({ title, endpoint, fields }: EntityCrudPanelProps) {
  const initialValues = useMemo(
    () =>
      Object.fromEntries(
        fields.map((field) => {
          if (field.type === "number") return [field.key, "0"];
          return [field.key, ""];
        })
      ),
    [fields]
  );
  const [form, setForm] = useState<Record<string, string>>(initialValues);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = {};
      fields.forEach((field) => {
        const raw = form[field.key];
        if (!raw && !field.required) return;
        payload[field.key] = field.type === "number" ? Number(raw) : raw;
      });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(body.error?.message ?? "Falha ao salvar");
      }

      setFeedback("Registro salvo com sucesso.");
      setForm(initialValues);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h2>{title}</h2>
      <form className="grid" onSubmit={onSubmit} style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        {fields.map((field) => (
          <label key={field.key} style={{ display: "grid", gap: 4 }}>
            <span>{field.label}</span>
            <input
              required={field.required}
              type={field.type ?? "text"}
              value={form[field.key] ?? ""}
              onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
              style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px" }}
            />
          </label>
        ))}
        <button type="submit" disabled={loading} style={{ padding: "10px 12px", borderRadius: 8 }}>
          {loading ? "Salvando..." : "Salvar"}
        </button>
      </form>
      {feedback ? <p>{feedback}</p> : null}
    </section>
  );
}
