import { Link } from "react-router-dom";

import type { LoadingManifestSummary } from "../../api/types.js";
import { formatLoadingManifestTableNumberLabel } from "../../format/loading-manifest.js";
import { BirzhaPagination } from "../../ui/BirzhaPagination.js";

function formatManifestPackages(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return "—";
  }
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

type Props = {
  manifests: LoadingManifestSummary[];
  totalCount: number;
  pageIndex: number;
  pageCount: number;
  distributionBase: string;
  activeManifestId: string;
  tripNumberById: Map<string, string>;
  deletingManifestId: string | null;
  onPageChange: (page: number) => void;
  onDelete: (manifest: LoadingManifestSummary) => void;
};

export function DistributionManifestListTable({
  manifests,
  totalCount,
  pageIndex,
  pageCount,
  distributionBase,
  activeManifestId,
  tripNumberById,
  deletingManifestId,
  onPageChange,
  onDelete,
}: Props) {
  return (
    <div className="birzha-clean-ops-list">
      <h4 className="birzha-clean-ops-list__title">
        Сохранённые погрузочные накладные ({totalCount.toLocaleString("ru-RU")})
      </h4>
      <div className="birzha-table-scroll birzha-table-scroll--sticky-head birzha-nakl-lines-card">
        <table className="birzha-data-table birzha-data-table--compact" aria-label="Сохранённые погрузочные накладные">
          <thead>
            <tr>
              <th>№</th>
              <th>Рейс</th>
              <th>Дата</th>
              <th>Склад</th>
              <th>Город</th>
              <th className="birzha-data-table__num">Кг</th>
              <th className="birzha-data-table__num">Ящ.</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {manifests.map((m) => {
              const isCurrent = m.id === activeManifestId;
              const tripLabel = m.tripId ? (tripNumberById.get(m.tripId) ?? "—") : "—";
              const numberLabel = formatLoadingManifestTableNumberLabel({
                manifestNumber: m.manifestNumber,
                destinationName: m.destinationName,
                docDate: m.docDate,
                tripLabel,
              });
              const deleting = deletingManifestId === m.id;
              return (
                <tr key={m.id} className={isCurrent ? "birzha-distribution-manifest-row--current" : undefined}>
                  <td className="birzha-data-table__emph">{numberLabel}</td>
                  <td>{tripLabel}</td>
                  <td>{m.docDate}</td>
                  <td>{m.warehouseName}</td>
                  <td>{m.destinationName}</td>
                  <td className="birzha-data-table__num">
                    {m.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="birzha-data-table__num">{formatManifestPackages(m.packagesApprox)}</td>
                  <td className="birzha-distribution-manifest-row__actions">
                    <div className="birzha-clean-ops-row-actions">
                      <Link to={`${distributionBase}/${encodeURIComponent(m.id)}`} className="birzha-clean-ops-text-btn">
                        {isCurrent ? "Открыта" : "Открыть"}
                      </Link>
                      <button
                        type="button"
                        className="birzha-btn-danger-outline birzha-btn-danger-outline--compact"
                      disabled={deletingManifestId != null}
                      onClick={() => onDelete(m)}
                    >
                      {deleting ? "…" : "Удалить"}
                    </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <BirzhaPagination
          pageIndex={pageIndex}
          pageCount={pageCount}
          itemLabel="погрузочных"
          onPageChange={onPageChange}
        />
      ) : null}
    </div>
  );
}
