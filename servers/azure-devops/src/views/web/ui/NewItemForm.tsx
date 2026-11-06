/**
 * The new work item form, modelled on the Azure DevOps form. It is also the "review before it is
 * created" screen: nothing is sent until Save is pressed, and then the host asks the user to approve
 * the create call. Fields can arrive pre-filled by the assistant.
 */
import { Avatar, Button, Field, Input, MessageBar, MessageBarBody, Select, Tab, TabList, Textarea, makeStyles, tokens } from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  ArrowUndoRegular,
  AttachRegular,
  CommentRegular,
  ErrorCircleFilled,
  HistoryRegular,
  LinkRegular,
  LockClosedRegular,
  PersonRegular,
  MoreVerticalRegular,
  SaveRegular,
  TagRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useState } from "react";
import { EMPTY_VALUES, type NewItemValues, descriptionToHtml, getValue, withValue } from "../lib/form";
import { PlanningField } from "./PlanningField";
import { ClickField, ClickToEdit, FormSection, PersonField, RichEditor } from "./RealForm";
import { useFormStyles } from "./formStyles";
import { REF, effectiveFields, fieldGroupsFor, textField } from "../lib/process-fields";
import type { Iteration } from "../lib/boards-logic";
import { DeploymentHelp, DevelopmentHelp } from "./AdoHelp";
import { LinkButton, TypeIcon, initialsOf } from "./parts";
import { RichHtml } from "./RichHtml";
import { S, newItemHeader } from "./strings";

/** The priority a new item starts with, as the web form shows it. */
const DEFAULT_PRIORITY = "2";

/** What the web form starts a new item with: Value area "Business" and Severity "3 - Medium" when the type has them. */
function valueAreaDefault(fields: ReadonlySet<string>): Record<string, string> {
  return { ...(fields.has(REF.valueArea) ? { [REF.valueArea]: "Business" } : {}), ...(fields.has(REF.severity) ? { [REF.severity]: "3 - Medium" } : {}) };
}

const useStyles = makeStyles({
  page: {
    "@media (max-width: 480px)": { padding: "10px 8px" },
    "padding": "12px 16px",
    "backgroundColor": tokens.colorNeutralBackground1,
    "display": "flex",
    "flexDirection": "column",
    "gap": "10px",
  },
  header: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: "0.04em",
    color: tokens.colorNeutralForeground2,
    display: "flex",
    gap: "6px",
    alignItems: "center",
  },
  title: { fontSize: tokens.fontSizeBase500 },
  bar: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
  fields: {
    "display": "grid",
    "gridTemplateColumns": "repeat(4, minmax(0, 1fr))",
    "gap": "8px",
    "@media (max-width: 480px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
    "@media (max-width: 380px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  cols: { "display": "grid", "gridTemplateColumns": "minmax(0, 3fr) minmax(0, 2fr)", "gap": "16px", "@media (max-width: 560px)": { gridTemplateColumns: "minmax(0, 1fr)" } },
  section: { display: "flex", flexDirection: "column", gap: "6px" },
  sectionTitle: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, paddingBottom: "2px" },
  help: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  tagRow: { display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

export interface FormType {
  name: string;
  color?: string;
  /** First state of the type, shown read-only (a new item starts there). */
  initialState?: string;
  /** Reference names of the fields the type has (see process-fields.ts); the form shows only those. */
  fields: string[];
}

export interface ParentOption {
  id: number;
  title: string;
}

export interface NewItemFormProps {
  types: FormType[];
  type: string;
  initial?: Partial<NewItemValues>;
  initialParentId?: number;
  iterations: Iteration[];
  defaultIterationPath?: string;
  defaultAreaPath?: string;
  /** Candidate parents for the chosen type (empty hides the parent control). */
  parents: ParentOption[];
  /** The signed-in user, for the avatar beside the comment box. */
  me?: { name: string };
  busy?: boolean;
  /** Error from the last Save (including a rejected approval). */
  error?: string | null;
  onType?: (type: string) => void;
  /** Starts the create. Called only from the Save button; the host then asks the user to approve. */
  onSave?: (type: string, values: NewItemValues, parentId?: number) => void;
}

export function NewItemForm(props: NewItemFormProps): ReactElement {
  const s = useStyles();
  const current = props.types.find((t) => t.name === props.type) ?? props.types[0];
  // Defaults first, then the assistant's proposal; an empty proposed value never wipes a default.
  const [values, setValues] = useState<NewItemValues>(() => {
    const proposed = Object.fromEntries(Object.entries(props.initial ?? {}).filter(([, v]) => v !== "" && v !== undefined && !(Array.isArray(v) && v.length === 0)));
    return {
      ...EMPTY_VALUES,
      priority: DEFAULT_PRIORITY,
      areaPath: props.defaultAreaPath ?? "",
      iterationPath: props.defaultIterationPath ?? "",
      ...proposed,
      // Defaults of the type first, then what the proposal names.
      extras: { ...valueAreaDefault(effectiveFields(current?.name ?? "", current?.fields)), ...(props.initial?.extras ?? {}) },
    };
  });
  const [tagDraft, setTagDraft] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [parentId, setParentId] = useState<number | undefined>(props.initialParentId);
  const [showParent, setShowParent] = useState(props.initialParentId !== undefined);
  const [editingText, setEditingText] = useState(false);
  const [editingAcceptance, setEditingAcceptance] = useState(false);
  const [editingSystemInfo, setEditingSystemInfo] = useState(false);
  const f = useFormStyles();
  const set = <K extends keyof NewItemValues>(key: K, value: NewItemValues[K]): void => setValues((v) => ({ ...v, [key]: value }));
  const typeFields = effectiveFields(current?.name ?? "", current?.fields);
  const text = textField(typeFields);
  const groups = fieldGroupsFor(current?.name ?? "", typeFields);
  const locked = Boolean(props.busy);

  const onSaveClick = (): void => {
    if (values.title.trim() === "" || !current) return;
    props.onSave?.(current.name, values, parentId);
  };

  const color = current?.color ? `#${current.color.replace(/^#/, "")}` : "#666666";
  const titleEmpty = values.title.trim() === "";
  const stateDot = <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#b2b2b2", flexShrink: 0 }} aria-hidden="true" />;

  return (
    <div className={f.page}>
      {props.types.length > 1 && (
        <TabList size="small" selectedValue={current?.name} onTabSelect={(_, d) => !locked && props.onType?.(String(d.value))} aria-label="Work item type" style={{ padding: "4px 8px" }}>
          {props.types.map((t) => (
            <Tab key={t.name} value={t.name} disabled={locked}>
              {t.name}
            </Tab>
          ))}
        </TabList>
      )}
      <div className={f.band} style={{ borderLeftColor: color }}>
        <div className={f.top}>
          <TypeIcon type={current?.name ?? ""} color={current?.color} />
          <span className={f.typeLabel}>{newItemHeader(current?.name ?? "")}</span>
          {titleEmpty && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: tokens.colorPaletteRedForeground1, fontSize: tokens.fontSizeBase300 }} role="alert">
              <ErrorCircleFilled fontSize={14} aria-hidden="true" />
              {S.form.titleRequired}
            </span>
          )}
        </div>
        <Input
          appearance="underline"
          className={f.titleInput}
          placeholder="Enter title"
          aria-label="Title"
          aria-invalid={titleEmpty}
          value={values.title}
          disabled={locked}
          onChange={(_, d) => set("title", d.value)}
        />
        <div className={f.row2}>
          <div className={f.left2}>
            <PersonField value={values.assignedTo} name={values.assignedTo || undefined} disabled={locked} onChange={(v) => set("assignedTo", v)} />
            <span className={s.help} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: tokens.colorBrandForegroundLink }}>
              <CommentRegular /> {S.form.comments}
            </span>
            <span className={f.tagRow}>
              {values.tags.map((t) => (
                <Button
                  key={t}
                  size="small"
                  appearance="outline"
                  disabled={locked}
                  onClick={() =>
                    set(
                      "tags",
                      values.tags.filter((x) => x !== t)
                    )
                  }
                  aria-label={`Remove tag ${t}`}>
                  {t}
                </Button>
              ))}
              {addingTag ? (
                <Input
                  size="small"
                  autoFocus
                  value={tagDraft}
                  placeholder="Tag"
                  onChange={(_, d) => setTagDraft(d.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagDraft.trim()) {
                      set("tags", [...values.tags, tagDraft.trim()]);
                      setTagDraft("");
                      setAddingTag(false);
                    } else if (e.key === "Escape") setAddingTag(false);
                  }}
                />
              ) : (
                <Button appearance="subtle" size="small" icon={<TagRegular />} disabled={locked} onClick={() => setAddingTag(true)}>
                  {S.form.addTag}
                </Button>
              )}
            </span>
          </div>
          <div className={f.right2}>
            <Button appearance="secondary" icon={<SaveRegular />} disabled={locked || titleEmpty} onClick={onSaveClick}>
              {S.form.save}
            </Button>
            <Button appearance="subtle" icon={<ArrowClockwiseRegular />} aria-label="Refresh" disabled />
            <Button appearance="subtle" icon={<ArrowUndoRegular />} aria-label="Undo changes" disabled />
            <Button appearance="subtle" icon={<MoreVerticalRegular />} aria-label="More actions" disabled />
          </div>
        </div>
      </div>
      <div className={f.fieldsBand}>
        <div className={f.grid}>
          <ClickField label={S.form.state} layout="inline" value={current?.initialState ?? ""} readOnly leading={stateDot} />
          <ClickField label={S.form.area} layout="inline" value={values.areaPath} disabled={locked} onChange={(v) => set("areaPath", v)} />
          <ClickField
            label={S.form.reason}
            layout="inline"
            value={current?.initialState === "To Do" ? "Added to backlog" : (current?.initialState ?? "")}
            readOnly
            leading={<LockClosedRegular aria-hidden="true" style={{ color: tokens.colorNeutralForeground3 }} />}
          />
          <ClickField
            label={S.form.iteration}
            layout="inline"
            value={values.iterationPath}
            options={props.iterations.map((it) => ({ value: it.path }))}
            disabled={locked}
            onChange={(v) => set("iterationPath", v)}
          />
        </div>
      </div>
      <div className={f.tabsRow}>
        <TabList size="small" selectedValue="details">
          <Tab value="details">{S.form.details}</Tab>
          <Tab value="history" icon={<HistoryRegular />} aria-label="History" disabled />
          <Tab value="links" icon={<LinkRegular />} aria-label="Links" disabled>
            0
          </Tab>
          <Tab value="attachments" icon={<AttachRegular />} aria-label="Attachments" disabled>
            0
          </Tab>
        </TabList>
      </div>
      <div className={f.cols}>
        <div className={f.section}>
          <FormSection title={text.label}>
            {editingText ? (
              <RichEditor
                legacy={text.ref !== REF.description}
                html={descriptionToHtml(values.description)}
                label={text.label}
                disabled={locked}
                onChange={(html) => set("description", html)}
                onClose={() => setEditingText(false)}
              />
            ) : (
              <ClickToEdit empty={values.description.trim() === ""} placeholder={`Click to add ${text.label}.`} canEdit={!locked} editing={false} onStart={() => setEditingText(true)}>
                <RichHtml html={descriptionToHtml(values.description)} />
              </ClickToEdit>
            )}
          </FormSection>
          {typeFields.has(REF.acceptance) && (
            <FormSection title="Acceptance Criteria">
              <>
                {editingAcceptance ? (
                  <RichEditor
                    html={descriptionToHtml(values.acceptance)}
                    label="Acceptance Criteria"
                    disabled={locked}
                    onChange={(html) => set("acceptance", html)}
                    onClose={() => setEditingAcceptance(false)}
                  />
                ) : (
                  <ClickToEdit empty={values.acceptance.trim() === ""} placeholder="Click to add Acceptance Criteria." canEdit={!locked} editing={false} onStart={() => setEditingAcceptance(true)}>
                    <RichHtml html={descriptionToHtml(values.acceptance)} />
                  </ClickToEdit>
                )}
              </>
            </FormSection>
          )}
          {typeFields.has(REF.systemInfo) && (
            <>
              <FormSection title="System Info">
                {editingSystemInfo ? (
                  <RichEditor
                    legacy
                    html={descriptionToHtml(values.extras[REF.systemInfo] ?? "")}
                    label="System Info"
                    disabled={locked}
                    onChange={(html) => setValues((v) => withValue(v, REF.systemInfo, html))}
                    onClose={() => setEditingSystemInfo(false)}
                  />
                ) : (
                  <ClickToEdit
                    empty={(values.extras[REF.systemInfo] ?? "").trim() === ""}
                    placeholder="Click to add System Info."
                    canEdit={!locked}
                    editing={false}
                    onStart={() => setEditingSystemInfo(true)}>
                    <RichHtml html={descriptionToHtml(values.extras[REF.systemInfo] ?? "")} />
                  </ClickToEdit>
                )}
              </FormSection>
            </>
          )}
          <FormSection title={S.form.discussion}>
            <div className={f.discussion}>
              {props.me ? <Avatar name={props.me.name} initials={initialsOf(props.me.name)} size={24} color="colorful" /> : <PersonRegular fontSize={24} aria-hidden="true" />}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <Textarea rows={3} resize="vertical" disabled placeholder="Add a comment. Use # to link a work item, @ to mention a person, or ! to link a pull request." aria-label="Add a comment" />
                <div style={{ textAlign: "right" }}>
                  <span className={s.help}>Comments can be added after the item is created.</span>
                </div>
              </div>
            </div>
          </FormSection>
        </div>
        <div className={f.section}>
          {groups
            .filter((g) => g.column === "main")
            .map((g) => (
              <FormSection key={g.title} title={g.title}>
                {g.fields.map((def) => (
                  <PlanningField key={def.ref} def={def} value={getValue(values, def.ref)} disabled={locked} onChange={(value) => setValues((v) => withValue(v, def.ref, value))} />
                ))}
              </FormSection>
            ))}
        </div>
        <div className={f.section}>
          <FormSection title={S.form.deployment}>
            <DeploymentHelp />
          </FormSection>
          <FormSection title={S.form.development}>
            <div>
              <LinkButton>{S.form.addLink}</LinkButton>
            </div>
            <DevelopmentHelp />
          </FormSection>
          <FormSection title={S.form.relatedWork}>
            {showParent ? (
              <Field label="Parent">
                <Select
                  style={{ width: "100%", minWidth: 0 }}
                  value={parentId === undefined ? "" : String(parentId)}
                  disabled={locked}
                  onChange={(_, d) => setParentId(d.value ? Number(d.value) : undefined)}>
                  <option value="" />
                  {props.parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {`${p.id} ${p.title}`}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <>
                <div>
                  <LinkButton onClick={() => props.parents.length > 0 && setShowParent(true)}>{S.form.addLink}</LinkButton>
                </div>
                <div className={s.help}>{S.form.relatedHelp}</div>
              </>
            )}
          </FormSection>
          {groups
            .filter((g) => g.column === "side")
            .map((g) => (
              <FormSection key={g.title} title={g.title}>
                {g.fields.map((def) => (
                  <PlanningField key={def.ref} def={def} value={getValue(values, def.ref)} disabled={locked} onChange={(value) => setValues((v) => withValue(v, def.ref, value))} />
                ))}
              </FormSection>
            ))}
        </div>
      </div>
      <div className={s.note} style={{ padding: "0 16px" }}>
        Nothing is created until you press Save. The host then asks you to approve the create.
      </div>
      {props.error && (
        <MessageBar intent="error">
          <MessageBarBody>{props.error}</MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}

/** What replaces the form after a successful Create: the result, with a way to open the new item or make another. */
export function CreatedPanel({
  type,
  id,
  title,
  onOpen,
  onAnother,
  onClose,
}: {
  type: string;
  id: number;
  title: string;
  onOpen?: () => void;
  onAnother?: () => void;
  onClose?: () => void;
}): ReactElement {
  const s = useStyles();
  return (
    <div className={s.page}>
      <MessageBar intent="success">
        <MessageBarBody>
          <strong>{`${type} ${id} created`}</strong>
          {`: ${title}`}
        </MessageBarBody>
      </MessageBar>
      <div className={s.bar}>
        <Button appearance="primary" onClick={onOpen}>
          Open
        </Button>
        <Button appearance="secondary" onClick={onAnother}>
          Create another
        </Button>
        {onClose && (
          <Button appearance="subtle" onClick={onClose}>
            Back
          </Button>
        )}
      </div>
    </div>
  );
}
