import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { apiPostJsonOr403 } from "../api/fetch-api.js";
import type { SupplierJson } from "../api/types.js";
import { queryRoots, suppliersFullListQueryOptions } from "../query/core-list-queries.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";
import { fieldStyle, selectFieldStyle } from "../ui/styles.js";

type PurchaseSupplierPickerProps = {
  supplierId: string;
  onSupplierIdChange: (id: string) => void;
  supplierName: string;
  onSupplierNameChange: (name: string) => void;
  enabled: boolean;
};

/**
 * Выбор тепличника из справочника или ввод нового (создаётся в справочнике).
 */
export function PurchaseSupplierPicker({
  supplierId,
  onSupplierIdChange,
  supplierName,
  onSupplierNameChange,
  enabled,
}: PurchaseSupplierPickerProps) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const suppliersQ = useQuery({
    ...suppliersFullListQueryOptions(),
    enabled,
  });

  const active = useMemo(
    () =>
      (suppliersQ.data?.suppliers ?? [])
        .filter((s) => s.isActive)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru")),
    [suppliersQ.data?.suppliers],
  );

  const createSupplier = useMutation({
    mutationFn: async (name: string) => {
      setCreateError(null);
      const res = (await apiPostJsonOr403(
        "/api/suppliers",
        { name },
        "Нет прав создавать тепличников (нужна роль склада/закупки/руководства).",
      )) as { supplier: SupplierJson };
      return res.supplier;
    },
    onSuccess: (supplier) => {
      void queryClient.invalidateQueries({ queryKey: queryRoots.suppliers });
      onSupplierIdChange(supplier.id);
      onSupplierNameChange(supplier.name);
      setNewName("");
    },
    onError: (e: Error) => {
      setCreateError(e.message);
    },
  });

  if (!enabled) {
    return (
      <label className="birzha-form-label">
        Поставщик *
        <input
          value={supplierName}
          onChange={(e) => onSupplierNameChange(e.target.value)}
          style={fieldStyle}
          placeholder="Теплица / отправитель"
          autoComplete="organization"
        />
      </label>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
      <label className="birzha-form-label">
        Тепличник *
        <BirzhaSelect
          aria-label="Тепличник *"
          value={supplierId}
          onChange={(v) => {
            onSupplierIdChange(v);
            const found = active.find((s) => s.id === v);
            onSupplierNameChange(found?.name ?? "");
          }}
          className="birzha-clean-ops-field"
          style={selectFieldStyle}
          placeholder="— выберите из справочника —"
          options={[
            { value: "", label: "— выберите из справочника —" },
            ...active.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      </label>
      <div className="birzha-inventory-inline-tools" style={{ margin: 0 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ ...fieldStyle, width: "100%", minWidth: 0 }}
          placeholder="Или новый тепличник — имя"
          autoComplete="off"
          aria-label="Новый тепличник"
        />
        <button
          type="button"
          className="birzha-btn birzha-btn--spaced birzha-inventory-inline-tools__submit"
          disabled={createSupplier.isPending || newName.trim().length === 0}
          onClick={() => void createSupplier.mutate(newName.trim())}
        >
          {createSupplier.isPending ? "…" : "Создать"}
        </button>
      </div>
      {createError ? (
        <p className="birzha-text-danger birzha-ui-sm" style={{ margin: 0 }}>
          {createError}
        </p>
      ) : null}
      {suppliersQ.isError ? (
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }}>
          Не удалось загрузить справочник тепличников.
        </p>
      ) : null}
    </div>
  );
}
