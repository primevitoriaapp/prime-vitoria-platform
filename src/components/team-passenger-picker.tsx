"use client";

import { useState } from "react";
import { PassengerAutocompleteInput } from "@/components/passenger-autocomplete-input";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import type { TeamDirection, TeamMember } from "@/lib/trips/team-trip";

/**
 * Escolher funcionários cadastrados da empresa: digita o nome, toca, e o endereço entra sozinho.
 * Com 2+ pessoas o app do motorista mostra as paradas na ordem da lista.
 */
export function TeamPassengerPicker({
  clientId,
  team,
  onTeamChange,
  direction,
  onDirectionChange,
  devFallbackRole
}: {
  clientId: string;
  team: TeamMember[];
  onTeamChange: (t: TeamMember[]) => void;
  direction: TeamDirection;
  onDirectionChange: (d: TeamDirection) => void;
  devFallbackRole: "admin" | "operador" | "cliente";
}) {
  const [query, setQuery] = useState("");

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= team.length) return;
    const next = [...team];
    [next[i], next[j]] = [next[j], next[i]];
    onTeamChange(next);
  };

  return (
    <div className="grid gap-3 rounded-2xl border border-prime-gold/40 bg-[#FBF8F1] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Funcionários cadastrados</p>
        <div className="inline-flex rounded-xl border border-prime-border bg-white p-1 text-xs">
          {(
            [
              ["buscar", "Buscar em casa"],
              ["levar", "Levar para casa"]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onDirectionChange(id)}
              className={`rounded-lg px-3 py-1 ${direction === id ? "bg-[#111] text-[#fff]" : "text-prime-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <PassengerAutocompleteInput
        clientId={clientId}
        label={team.length ? "Adicionar outro funcionário (digite o nome — se não tiver cadastro, aparece a opção de cadastrar)" : "Digite o nome do funcionário"}
        value={query}
        onChange={setQuery}
        onSelect={(p) => {
          setQuery("");
          if (team.some((m) => m.id === p.id)) return;
          onTeamChange([...team, { id: p.id, name: p.name, phone: p.phone, address: p.address?.trim() ?? "" }]);
        }}
        devFallbackRole={devFallbackRole}
        excludeIds={team.map((m) => m.id)}
      />

      {team.length ? (
        <ol className="grid gap-2">
          {team.map((m, i) => (
            <li key={m.id} className="rounded-xl border border-prime-border bg-white p-2.5">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#111] text-xs font-bold text-prime-gold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {m.name}
                    {m.phone ? <span className="font-normal text-prime-muted"> · {m.phone}</span> : null}
                  </p>
                  {m.address.trim().length >= 3 ? (
                    <p className="text-xs text-prime-muted">{m.address}</p>
                  ) : (
                    <input
                      className={`${PRIME_INPUT_CLASS} mt-1 border-amber-400`}
                      placeholder="Sem endereço cadastrado — digite aqui"
                      value={m.address}
                      onChange={(e) => onTeamChange(team.map((x) => (x.id === m.id ? { ...x, address: e.target.value } : x)))}
                    />
                  )}
                </div>
                <span className="flex shrink-0 gap-1">
                  {team.length > 1 ? (
                    <>
                      <button type="button" aria-label="Subir" className="h-7 w-7 rounded-lg ring-1 ring-prime-border disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label="Descer"
                        className="h-7 w-7 rounded-lg ring-1 ring-prime-border disabled:opacity-30"
                        disabled={i === team.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        ↓
                      </button>
                    </>
                  ) : null}
                  <button type="button" aria-label="Tirar" className="h-7 w-7 rounded-lg text-red-700 ring-1 ring-prime-border" onClick={() => onTeamChange(team.filter((x) => x.id !== m.id))}>
                    ×
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <p className="text-xs text-prime-muted">
        {team.length === 0
          ? "Escolha quem vai e o endereço de cada um entra sozinho. Passageiro que não é funcionário: use os campos abaixo."
          : direction === "buscar"
            ? team.length > 1
              ? `O motorista busca na ordem 1 → ${team.length}. Paradas para deixar pessoas: “＋ Adicionar parada” abaixo.`
              : "O embarque fica no endereço do funcionário. Para deixar alguém no caminho, use “＋ Adicionar parada” logo abaixo."
            : team.length > 1
              ? `Saída do local de origem; o motorista deixa cada um em casa na ordem 1 → ${team.length}.`
              : "O destino fica no endereço do funcionário. Informe só o local de saída."}
      </p>
    </div>
  );
}
