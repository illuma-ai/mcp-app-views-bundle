/** One Planning field of a work item form: a pick list, a number or a date, as the type defines it. It is text at rest and an editor on click. */
import { Tooltip, tokens } from "@fluentui/react-components";
import { InfoRegular, LockClosedRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";
import type { FieldDef } from "../lib/process-fields";
import { ClickField } from "./RealForm";

/** A stored date ("2026-11-30T00:00:00Z") as the value of a date input ("2026-11-30"). */
export function toDateInput(value: string | undefined): string {
  return /^\d{4}-\d{2}-\d{2}/.test(value ?? "") ? (value as string).slice(0, 10) : "";
}

export function PlanningField({ def, value, disabled, onChange }: { def: FieldDef; value: string; disabled?: boolean; onChange: (value: string) => void }): ReactElement {
  const info =
    def.info === undefined ? undefined : (
      <Tooltip content={def.info} relationship="description">
        <InfoRegular fontSize={14} aria-label={def.info} />
      </Tooltip>
    );
  return (
    <ClickField
      label={def.label}
      labelExtra={info}
      layout="stacked"
      value={def.kind === "date" ? toDateInput(value) : value}
      options={def.kind === "select" ? [{ value: "" }, ...(def.options ?? []).map((o) => ({ value: o }))] : undefined}
      type={def.kind === "date" ? "date" : def.kind === "number" ? "number" : "text"}
      placeholder={def.kind === "date" ? "Select a date..." : undefined}
      disabled={disabled}
      readOnly={def.readOnly}
      leading={def.readOnly ? <LockClosedRegular aria-hidden="true" style={{ color: tokens.colorNeutralForeground3 }} /> : undefined}
      onChange={onChange}
    />
  );
}
