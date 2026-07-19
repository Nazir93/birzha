import { Link } from "react-router-dom";

import type { BatchListItem, LoadingManifestSummary, TripJson } from "../../api/types.js";
import { formatLoadingManifestDisplayName, resolveLoadingManifestNumberForSave } from "../../format/loading-manifest.js";
import { tripLocksManifestDestination } from "../../format/loading-manifest-trip-destination.js";
import { formatTripSelectLabel } from "../../format/trip-label.js";
import { BirzhaDateField } from "../BirzhaCalendarFields.js";
import { ErrorAlert, InfoAlert } from "../../ui/ErrorAlerts.js";
import { btnClassSpaced, fieldStyle, selectFieldStyle } from "../../ui/styles.js";
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
  const tripId = newManifestTripId.trim();
  const selectedTrip = openTripsForAssign.find((t) => t.id === tripId);
  const destinationLockedByTrip = !appendMode && tripLocksManifestDestination(selectedTrip);
  const effectiveDestinationCode =
    destinationLockedByTrip && selectedTrip?.destinationCode?.trim()
      ? selectedTrip.destinationCode.trim()
      : manifestDestinationCode;

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
    const destLabel = labelDest[effectiveDestinationCode] ?? effectiveDestinationCode;
    onSave({
      warehouseId: selectedWarehouse,
      destinationCode: effectiveDestinationCode,
      batchIds: tableRows.map((b) => b.id),
      docDate: manifestDate,
      manifestNumber: resolveLoadingManifestNumberForSave({
        tripNumber: selectedTrip?.tripNumber,
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
          Рейс
          <BirzhaSelect
            value={newManifestTripId}
            onChange={onNewManifestTripIdChange}
            style={selectFieldStyle}
            disabled={tripsPending || appendMode}
            placeholder={
              tripsPending
                ? "— загрузка рейсов —"
                : openTripsForAssign.length === 0
                  ? "— сначала создайте рейс —"
                  : "— выберите рейс (необязательно) —"
            }
            options={[
              {
                value: "",
                label: tripsPending
                  ? "— загрузка рейсов —"
                  : openTripsForAssign.length === 0
                    ? "— сначала создайте рейс —"
                    : "— без рейса (привязать позже) —",
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
            value={effectiveDestinationCode}
            onChange={onManifestDestinationCodeChange}
            style={selectFieldStyle}
            disabled={appendMode || destinationLockedByTrip}
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
          , затем выберите его здесь или привяжите позже в разделе «Смена рейса».
        </p>
      ) : destinationLockedByTrip ? (
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
          Город взят из рейса — изменить нельзя. Чтобы указать другой город, выберите другой рейс или «без
          рейса».
        </p>
      ) : !appendMode ? (
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
          Рейс можно не выбирать — сохраните накладную и привяжите рейс в разделе «Смена рейса».
        </p>
      ) : null}
      <p className="birzha-clean-ops-form-actions">
        <button
          type="button"
          className={btnClassSpaced}
          disabled={
            createPending ||
            tableRows.length === 0 ||
            (!appendMode && (!manifestDate || !effectiveDestinationCode))
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
          message="Не удалось сохранить. Выберите город, дату и отмеченные партии."
          title="Сохранение"
        />
      ) : null}
      {tableRows.length > 0 ? (
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
          В накладную: <strong>{tableRows.length}</strong> парт.,{" "}
          <strong>
            {tableRows.reduce((a, b) => a + b.onWarehouseKg, 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
          </strong>{" "}
          кг · {labelDest[effectiveDestinationCode] ?? effectiveDestinationCode}
        </p>
      ) : null}
    </div>
  );
}
