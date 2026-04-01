import type { PlumbingPartRow } from "../types/diagnostics";

type PartsTableProps = {
  rows: PlumbingPartRow[];
  readOnly?: boolean;
};

export default function PartsTable({ rows, readOnly = true }: PartsTableProps) {
  const displayRows = rows.length > 0 ? rows : [{ part_name: "N/A" }];

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left font-medium text-slate-700">
            <th className="px-3 py-2">Part Name</th>
            <th className="w-20 px-3 py-2">Quantity</th>
            <th className="w-24 px-3 py-2">Tech Price</th>
            <th className="px-3 py-2">Location of Repair</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2">
                <input
                  type="text"
                  value={row.part_name ?? ""}
                  readOnly
                  disabled={readOnly}
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-700"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  value={row.quantity ?? 1}
                  readOnly
                  disabled={readOnly}
                  min={0}
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-700"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  value={row.tech_price ?? 0}
                  readOnly
                  disabled={readOnly}
                  step="0.01"
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-700"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="text"
                  value={row.location_of_repair ?? ""}
                  readOnly
                  disabled={readOnly}
                  className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-700"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
