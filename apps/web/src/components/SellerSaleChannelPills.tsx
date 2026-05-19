import type { SaleChannelFilter } from "../format/trip-sales-channel.js";
import { SALE_CHANNEL_LABELS } from "../format/trip-sales-channel.js";

const CHANNELS: SaleChannelFilter[] = ["all", "retail", "wholesale"];

export function SellerSaleChannelPills({
  value,
  onChange,
  wholesaleDisabled,
  wholesaleDisabledTitle,
}: {
  value: SaleChannelFilter;
  onChange: (next: SaleChannelFilter) => void;
  wholesaleDisabled?: boolean;
  wholesaleDisabledTitle?: string;
}) {
  return (
    <div className="birzha-seller-channel-pills" role="group" aria-label="Розница, опт или всего">
      {CHANNELS.map((ch) => {
        const disabled = ch === "wholesale" && wholesaleDisabled;
        return (
          <button
            key={ch}
            type="button"
            className={`birzha-seller-channel-pills__btn${value === ch ? " birzha-seller-channel-pills__btn--active" : ""}`}
            aria-pressed={value === ch}
            disabled={disabled}
            title={disabled ? wholesaleDisabledTitle : undefined}
            onClick={() => {
              if (disabled) {
                return;
              }
              onChange(ch);
            }}
          >
            {SALE_CHANNEL_LABELS[ch]}
          </button>
        );
      })}
    </div>
  );
}
