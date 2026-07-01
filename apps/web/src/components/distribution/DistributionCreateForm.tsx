import { Link } from "react-router-dom";

import type { BatchListItem, LoadingManifestSummary } from "../../api/types.js";
import { formatLoadingManifestDisplayName, resolveLoadingManifestNumberForSave } from "../../format/loading-manifest.js";
import { formatTripSelectLabel } from "../../format/trip-label.js";
import type { TripJson } from "../../api/types.js";
import { BirzhaDateField } from "../BirzhaCalendarFields.js";
import { ErrorAlert, InfoAlert } from "../../ui/ErrorAlerts.js";
import { btnStyle, fieldStyle } from "../../ui/styles.js";
import { BirzhaSelect } from "../../ui/BirzhaSelect.js";

type CreatePayload = {
  appendToManifestId?: string;
  warehouseId: string;
  destinationCode: string;
  batchIds: string[];
  docDate: string;
  manifestNumber: string;
};

type Props = {
  appendMode: boolean;
  appendTargetManifest: LoadingManifestSummary | null;
  onClose: () => void;
  newManifestTripId: string;
  onNewManifestTripIdChange: (value: string) => void;
  manifestDestinationCode: string;
  onManifestDestinationCodeChange: (value: string) => void;
  manifestDate: string;
  onManifestDateChange: (value: string) => void;
  destAllowed: readonly string[];
  labelDest: Record<string, string>;
  openTripsForAssign: TripJson[];
  tripsPending: boolean;
  selectedWarehouse: string;
  tableRows: BatchListItem[];
  takenManifestNumbers: string[];
  createPending: boolean;
  createError: unknown;
  tripsBase: string;
  onSave: (payload: CreatePayload) => void;
};

export function DistributionCreateForm({
  appendMode,
  appendTargetManifest,
  onClose,
  newManifestTripId,
  onNewManifestTripIdChange,
  manifestDestinationCode,
  onManifestDestinationCodeChange,
  manifestDate,
  onManifestDateChange,
  destAllowed,
  labelDest,
  openTripsForAssign,
  tripsPending,
  selectedWarehouse,
  tableRows,
  takenManifestNumbers,
  createPending,
  createError,
  tripsBase,
  onSave,
}: Props) {
  const handleSave = () => {
    if (appendMode && appendTargetManifest) {
      onSave({
        appendToManifestId: appendTargetManifest.id,
        warehouseId: selectedWarehouse,
        destinationCode: appendTargetManifest.destinationCode,
        batchIds: tableRows.map((b) => b.id),
        docDate: appendTargetManifest.docDate,
        manifestNumber: appendTargetManifest.manifestNumber,
      });
      return;
    }
    const destLabel = labelDest[manifestDestinationCode] ?? manifestDestinationCode;
    const tripId = newManifestTripId.trim();
    const trip = openTripsForAssign.find((t) => t.id === tripId);
    onSave({
      warehouseId: selectedWarehouse,
      destinationCode: manifestDestinationCode,
      batchIds: tableRows.map((b) => b.id),
      docDate: manifestDate,
      manifestNumber: resolveLoadingManifestNumberForSave({
        tripNumber: trip?.tripNumber,
        destinationLabel: destLabel,
        docDate: manifestDate,
        takenNumbers: takenManifestNumbers,
      }),
    });
  };

  return (
    <div className="birzha-clean-ops-list" role="region" aria-label="Новая погрузочная накладная">
      <p className="no-print birzha-section-backlink">
        <button type="button" className="birzha-clean-ops-text-btn" onClick={onClose}>
          ← Вернуться к списанию и отбору
        </button>
      </p>
      <h4 className="birzha-clean-ops-list__title">2. Погрузочная накладная</h4>
      {appendMode && appendTargetManifest ? (
        <InfoAlert title="Добавление в существующую погрузочную">
          Товар будет добавлен в уже открытую погрузочную:{" "}
          <strong>
            {formatLoadingManifestDisplayName({
              manifestNumber: appendTargetManifest.manifestNumber,
              destinationName: appendTargetManifest.destinationName,
            })}
          </strong>
          . Новая погрузочная создана не будет — можно добавить партии с другого склада в эту же накладную.
        </InfoAlert>
      ) : null}
      <div className="birzha-clean-ops-meta-grid">
        <label className="birzha-form-label">
          Рейс *
          <BirzhaSelect
            value={newManifestTripId}
            onChange={onNewManifestTripIdChange}
            style={fieldStyle}
            disabled={tripsPending || appendMode}
            placeholder={
              tripsPending
                ? "— загрузка рейсов —"
                : openTripsForAssign.length === 0
                  ? "— сначала создайте рейс —"
                  : "— выберите рейс —"
            }
            options={[
              {
                value: "",
                label: tripsPending
                  ? "— загрузка рейсов —"
                  : openTripsForAssign.length === 0
                    ? "— сначала создайте рейс —"
                    : "— выберите рейс —",
              },
              ...openTripsForAssign.map((t) => ({
                value: t.id,
                label: formatTripSelectLabel(t),
              })),
            ]}
          />
        </label>
        <label className="birzha-form-label">
          Город / направление *
          <BirzhaSelect
            value={manifestDestinationCode}
            onChange={onManifestDestinationCodeChange}
            style={fieldStyle}
            disabled={appendMode}
            options={destAllowed.map((d) => ({
              value: d,
              label: labelDest[d] ?? d,
            }))}
          />
        </label>
        <label className="birzha-form-label">
          Дата *
          <BirzhaDateField value={manifestDate} onChange={onManifestDateChange} style={fieldStyle} />
        </label>
      </div>
      {openTripsForAssign.length === 0 && !tripsPending ? (
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
          Создайте рейс в разделе{" "}
          <Link to={tripsBase} style={{ fontWeight: 600 }}>
            «Рейсы»
          </Link>
          , затем выберите его здесь — кг уйдут в рейс при сохранении.
        </p>
      ) : null}
      <p className="birzha-clean-ops-form-actions">
        <button
          type="button"
          style={btnStyle}
          disabled={
            createPending ||
            tableRows.length === 0 ||
            (!appendMode &&
              (!manifestDate ||
                !manifestDestinationCode ||
                !newManifestTripId.trim() ||
                openTripsForAssign.length === 0))
          }
          onClick={handleSave}
        >
          {createPending
            ? "Сохранение…"
            : appendMode
              ? "Добавить в текущую погрузочную"
              : "Сохранить погрузочную накладную"}
        </button>
      </p>
      {createError ? (
        <ErrorAlert
          error={createError}
          message="Не удалось сохранить. Выберите рейс, город, дату и отмеченные партии."
          title="Сохранение"
        />
      ) : null}
      {tableRows.length > 0 ? (
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
          В накладную: <strong>{tableRows.length}</strong> парт.,{" "}
          <strong>
            {tableRows.reduce((a, b) => a + b.onWarehouseKg, 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
          </strong>{" "}
          кг · {labelDest[manifestDestinationCode] ?? manifestDestinationCode}
        </p>
      ) : null}
    </div>
  );
}
