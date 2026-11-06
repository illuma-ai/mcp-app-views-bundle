/**
 * The work item form, laid out like the Azure DevOps form: a header band with the type, id and an
 * inline-editable title, the assignee and tags row with Save / Follow / refresh / undo, a fields grid
 * with State, Reason, Area and Iteration, the tab pills, and the three-column Details page
 * (Description and Discussion | Planning | Deployment, Development and Related Work).
 * Presentational: data and handlers come from the container. Save and "Add comment" are the only
 * controls that start a write, and the host asks the user to approve each.
 */
import { SURFACE } from "../lib/host-theme";
import { Avatar, Button, Field, Input, MessageBar, MessageBarBody, Tab, TabList, Textarea, tokens } from "@fluentui/react-components";
import {
  ChevronDownRegular,
  ArrowClockwiseRegular,
  ArrowLeftRegular,
  ArrowUndoRegular,
  AttachRegular,
  CommentRegular,
  EyeRegular,
  HistoryRegular,
  LinkRegular,
  LockClosedRegular,
  MoreVerticalRegular,
  PersonRegular,
  SaveRegular,
  SettingsRegular,
  TagRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Iteration } from "../lib/boards-logic";
import { type Comment, type Draft, type HistoryEntry, type Relation, buildUpdates, formatAgo, formatSize } from "../lib/detail";
import { effectiveFields, fieldGroupsFor, textField } from "../lib/process-fields";
import { PlanningField } from "./PlanningField";
import { PersonField, ClickField, ClickToEdit, FormSection, RichEditor } from "./RealForm";
import { FIELD, splitTags, toPerson, type Card, type Person } from "../lib/work-items";
import { REF } from "../lib/process-fields";
import { DeploymentHelp, DevelopmentHelp } from "./AdoHelp";
import { LinkButton, PersonChip, StateDot, TypeIcon, initialsOf } from "./parts";
import { RichHtml } from "./RichHtml";
import { S } from "./strings";
import { useFormStyles } from "./formStyles";

const useStyles = useFormStyles;

export type DetailTab = "details" | "history" | "links" | "attachments";

export interface WorkItemDetailProps {
  id: number;
  rev?: number;
  type: string;
  typeColor?: string;
  states: { name: string; color?: string }[];
  stateColors?: Record<string, string>;
  /** The values as read; the form edits a copy and Save sends only what changed. */
  original: Draft;
  /** Fields that are shown but not edited here. */
  areaPath?: string;
  reason?: string;
  changedBy?: Person;
  changed?: string;
  iterations: Iteration[];
  hasAcceptance: boolean;
  /** Reference names of the fields the type has; the Planning column and the text fields follow them. */
  fieldRefs?: string[];
  /** The signed-in user, for the avatar beside the comment box. */
  me?: Person;
  comments: Comment[];
  history: HistoryEntry[];
  relations: Relation[];
  /** Titles and states of the linked work items, by id. */
  linked: Record<number, Card>;
  typeColors?: Record<string, string>;
  tab?: DetailTab;
  canEdit: boolean;
  busy?: boolean;
  error?: string | null;
  /** Message after a successful save. */
  saved?: string | null;
  now?: Date;
  onTab?: (tab: DetailTab) => void;
  /** Starts the update with the edited values (Save). The host then asks the user to approve. */
  onSave?: (draft: Draft) => void;
  /** Starts adding a comment (Add comment). The host then asks the user to approve. */
  onAddComment?: (text: string) => void;
  onBack?: () => void;
  onRefresh?: () => void;
  onOpenRelated?: (id: number) => void;
  onOpenWeb?: (page?: "releases" | "learn" | "repos") => void;
  onLink?: (url: string) => void;
}

export function WorkItemDetail(props: WorkItemDetailProps): ReactElement {
  const s = useStyles();
  const [draft, setDraft] = useState<Draft>(props.original);
  const [tab, setTab] = useState<DetailTab>(props.tab ?? "details");
  const [comment, setComment] = useState("");
  const [editText, setEditText] = useState(false);
  const [markdown, setMarkdown] = useState(false);
  const [editAcc, setEditAcc] = useState(false);
  const [editSys, setEditSys] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const set = (ref: string, value: string): void => setDraft((d) => ({ ...d, [ref]: value }));
  const changed = buildUpdates(props.original, draft, props.rev).length > 0;
  const locked = !props.canEdit || Boolean(props.busy);
  const tags = splitTags(draft[FIELD.tags]);
  const typeFields = effectiveFields(props.type, props.fieldRefs);
  const mainText = textField(typeFields);
  const groups = fieldGroupsFor(props.type, typeFields);
  const titleMissing = draft[FIELD.title].trim() === "";
  const person = toPerson(draft[FIELD.assignedTo]);
  const color = props.typeColor ?? "#666666";
  const selectTab = (t: DetailTab): void => {
    setTab(t);
    props.onTab?.(t);
  };
  const stateColor = props.stateColors?.[draft[FIELD.state]] ?? props.states.find((st) => st.name === draft[FIELD.state])?.color ?? "#b2b2b2";

  const onSaveClick = (): void => {
    if (titleMissing) return;
    props.onSave?.(draft);
  };
  const onCommentClick = (): void => {
    const text = comment.trim();
    if (!text) return;
    props.onAddComment?.(text);
    setComment("");
  };

  const workLinks = props.relations.filter((r) => r.kind === "parent" || r.kind === "child" || r.kind === "related");
  const artifacts = props.relations.filter((r) => r.kind === "artifact" || r.kind === "hyperlink");
  const attachments = props.relations.filter((r) => r.kind === "attachment");
  const otherLinks = props.relations.filter((r) => r.kind !== "attachment");

  const relCard = (r: Relation): ReactElement => {
    const card = r.workItemId !== undefined ? props.linked[r.workItemId] : undefined;
    return (
      <div key={`${r.url}-${r.label}`} className={s.relCard}>
        <span className={s.rel}>
          {card && <TypeIcon type={card.type} color={props.typeColors?.[card.type]} />}
          <LinkButton className={s.relTitle} onClick={() => r.workItemId !== undefined && props.onOpenRelated?.(r.workItemId)}>
            {r.workItemId !== undefined ? `${r.workItemId} ${card?.title ?? ""}`.trim() : r.url}
          </LinkButton>
        </span>
        {card && (
          <span className={s.help} style={{ marginLeft: 22 }}>
            {card.changed ? `Updated ${formatAgo(card.changed, props.now)} ` : ""}
            <StateDot state={card.state} colors={props.stateColors} />
          </span>
        )}
      </div>
    );
  };
  const workGroups = (["parent", "child", "related"] as const).map((kind) => ({ kind, items: workLinks.filter((r) => r.kind === kind) })).filter((g) => g.items.length > 0);

  return (
    <div className={s.page}>
      <div className={s.band} style={{ borderLeftColor: color }}>
        <div className={s.top}>
          {props.onBack && <Button appearance="subtle" size="small" icon={<ArrowLeftRegular />} aria-label="Back" onClick={props.onBack} />}
          <span className={s.typeLabel}>
            <TypeIcon type={props.type} color={color} />
            <LinkButton onClick={() => props.onOpenWeb?.()}>{`${props.type.toUpperCase()} ${props.id}`}</LinkButton>
          </span>
        </div>
        <div className={s.titleRow}>
          <span className={s.idText}>{props.id}</span>
          <Field validationState={titleMissing ? "error" : "none"} validationMessage={titleMissing ? S.form.titleRequired : undefined} style={{ flex: 1, minWidth: 0 }}>
            <Input
              appearance="underline"
              className={s.titleInput}
              placeholder="Enter title"
              aria-label="Title"
              value={draft[FIELD.title]}
              disabled={locked}
              onChange={(_, d) => set(FIELD.title, d.value)}
            />
          </Field>
        </div>
        <div className={s.row2}>
          <div className={s.left2}>
            <PersonField value={draft[FIELD.assignedTo]} name={person?.name} disabled={locked} onChange={(v) => set(FIELD.assignedTo, v)} />
            <LinkButton onClick={() => selectTab("details")}>
              <CommentRegular /> {`${props.comments.length} ${props.comments.length === 1 ? "Comment" : "Comments"}`}
            </LinkButton>
            <span className={s.tagRow}>
              {tags.map((t) => (
                <Button key={t} size="small" appearance="outline" disabled={locked} aria-label={`Remove tag ${t}`} onClick={() => set(FIELD.tags, tags.filter((x) => x !== t).join("; "))}>
                  {t}
                </Button>
              ))}
              {props.canEdit &&
                (addingTag ? (
                  <Input
                    size="small"
                    autoFocus
                    value={tagDraft}
                    placeholder="Tag"
                    onChange={(_, d) => setTagDraft(d.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && tagDraft.trim()) {
                        set(FIELD.tags, [...tags, tagDraft.trim()].join("; "));
                        setTagDraft("");
                        setAddingTag(false);
                      } else if (e.key === "Escape") setAddingTag(false);
                    }}
                  />
                ) : (
                  <Button appearance="subtle" size="small" icon={<TagRegular />} disabled={locked} onClick={() => setAddingTag(true)}>
                    {S.form.addTag}
                  </Button>
                ))}
            </span>
          </div>
          <div className={s.right2}>
            {props.canEdit && (
              <Button appearance="secondary" icon={<SaveRegular />} disabled={locked || !changed || titleMissing} onClick={onSaveClick}>
                {S.form.save}
              </Button>
            )}
            <span className={s.group}>
              <Button appearance="secondary" icon={<EyeRegular />} onClick={() => props.onOpenWeb?.()}>
                Follow
              </Button>
              <Button appearance="secondary" icon={<SettingsRegular />} aria-label="Notification settings" onClick={() => props.onOpenWeb?.()} />
            </span>
            <Button appearance="subtle" icon={<ArrowClockwiseRegular />} aria-label="Refresh" onClick={props.onRefresh} />
            <Button
              appearance="subtle"
              icon={<ArrowUndoRegular />}
              aria-label="Undo changes"
              disabled={!changed || locked}
              onClick={() => {
                setDraft(props.original);
                setEditText(false);
              }}
            />
            <Button appearance="subtle" icon={<MoreVerticalRegular />} aria-label="More actions" onClick={() => props.onOpenWeb?.()} />
          </div>
        </div>
      </div>

      <div className={s.fieldsBand}>
        <div className={s.grid}>
          <ClickField
            label={S.form.state}
            layout="inline"
            value={draft[FIELD.state]}
            options={props.states.map((st) => ({ value: st.name }))}
            leading={<span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: stateColor, flexShrink: 0 }} aria-hidden="true" />}
            disabled={locked}
            onChange={(v) => set(FIELD.state, v)}
          />
          <ClickField label={S.form.area} layout="inline" value={props.areaPath ?? ""} readOnly />
          <ClickField label={S.form.reason} layout="inline" value={props.reason ?? ""} readOnly leading={<LockClosedRegular aria-hidden="true" style={{ color: tokens.colorNeutralForeground3 }} />} />
          <ClickField
            label={S.form.iteration}
            layout="inline"
            value={draft[FIELD.iterationPath]}
            options={props.iterations.map((it) => ({ value: it.path }))}
            disabled={locked}
            onChange={(v) => set(FIELD.iterationPath, v)}
          />
        </div>
        {props.changedBy && <div className={s.updated}>{`Updated by ${props.changedBy.name}: ${formatAgo(props.changed, props.now)}`}</div>}
      </div>

      <div className={s.tabsRow}>
        <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => selectTab(d.value as DetailTab)}>
          <Tab value="details">Details</Tab>
          <Tab value="history" icon={<HistoryRegular />} aria-label="History" />
          <Tab value="links" icon={<LinkRegular />} aria-label="Links">
            {otherLinks.length}
          </Tab>
          <Tab value="attachments" icon={<AttachRegular />} aria-label="Attachments">
            {attachments.length}
          </Tab>
        </TabList>
      </div>

      {tab === "details" && (
        <div className={s.cols}>
          <div className={s.section}>
            <FormSection title={mainText.label}>
              {editText ? (
                <RichEditor
                  legacy={mainText.ref !== REF.description}
                  html={draft[mainText.ref]}
                  label={mainText.label}
                  disabled={locked}
                  onChange={(html) => {
                    set(mainText.ref, html);
                  }}
                  onClose={() => setEditText(false)}
                />
              ) : (
                <ClickToEdit empty={!draft[mainText.ref]} placeholder={`Click to add ${mainText.label}.`} canEdit={props.canEdit} editing={false} onStart={() => setEditText(true)}>
                  <RichHtml html={draft[mainText.ref]} onLink={props.onLink} />
                </ClickToEdit>
              )}
            </FormSection>
            {(props.hasAcceptance || typeFields.has(REF.acceptance)) && (
              <FormSection title="Acceptance Criteria">
                {editAcc ? (
                  <RichEditor html={draft[FIELD.acceptance]} label="Acceptance Criteria" disabled={locked} onChange={(html) => set(FIELD.acceptance, html)} onClose={() => setEditAcc(false)} />
                ) : (
                  <ClickToEdit empty={!draft[FIELD.acceptance]} placeholder="Click to add Acceptance Criteria." canEdit={props.canEdit} editing={false} onStart={() => setEditAcc(true)}>
                    <RichHtml html={draft[FIELD.acceptance]} onLink={props.onLink} />
                  </ClickToEdit>
                )}
              </FormSection>
            )}
            {typeFields.has(REF.systemInfo) && (
              <FormSection title="System Info">
                {editSys ? (
                  <RichEditor legacy html={draft[REF.systemInfo]} label="System Info" disabled={locked} onChange={(html) => set(REF.systemInfo, html)} onClose={() => setEditSys(false)} />
                ) : (
                  <ClickToEdit empty={!draft[REF.systemInfo]} placeholder="Click to add System Info." canEdit={props.canEdit} editing={false} onStart={() => setEditSys(true)}>
                    <RichHtml html={draft[REF.systemInfo]} onLink={props.onLink} />
                  </ClickToEdit>
                )}
              </FormSection>
            )}
            <FormSection title={S.form.discussion}>
              {props.canEdit && (
                <div className={s.discussion}>
                  {props.me ? <Avatar name={props.me.name} initials={initialsOf(props.me.name)} size={24} color="colorful" /> : <PersonRegular fontSize={24} aria-hidden="true" />}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    <Textarea
                      rows={3}
                      resize="vertical"
                      placeholder="Add a comment. Use # to link a work item, @ to mention a person, or ! to link a pull request."
                      value={comment}
                      disabled={locked}
                      onChange={(_, d) => setComment(d.value)}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span>
                        {comment.trim() !== "" && (
                          <Button appearance="primary" size="small" disabled={locked} onClick={onCommentClick}>
                            Add comment
                          </Button>
                        )}
                      </span>
                      <LinkButton onClick={() => setMarkdown((m) => !m)}>{markdown ? "switch to rich text editor" : "switch to Markdown editor"}</LinkButton>
                    </div>
                  </div>
                </div>
              )}
              {props.comments.length === 0 && <div className={s.help}>No comments yet.</div>}
              {props.comments.map((c) => (
                <div key={c.id} className={s.comment}>
                  <div className={s.commentHead}>
                    <PersonChip person={c.author} size={20} />
                    <span>{formatAgo(c.date, props.now)}</span>
                  </div>
                  <RichHtml html={c.html} onLink={props.onLink} />
                </div>
              ))}
            </FormSection>
          </div>
          <div className={s.section}>
            {groups
              .filter((g) => g.column === "main")
              .map((g) => (
                <FormSection key={g.title} title={g.title}>
                  {g.fields.map((def) => (
                    <PlanningField key={def.ref} def={def} value={draft[def.ref] ?? ""} disabled={locked} onChange={(value) => set(def.ref, value)} />
                  ))}
                </FormSection>
              ))}
          </div>
          <div className={s.section}>
            <FormSection title={S.form.deployment}>
              <DeploymentHelp onLink={(w) => props.onOpenWeb?.(w === "releases" ? "releases" : "learn")} />
            </FormSection>
            <FormSection title={S.form.development}>
              <div>
                <LinkButton onClick={() => props.onOpenWeb?.("repos")}>{S.form.addLink}</LinkButton>
              </div>
              {artifacts.length === 0 ? (
                <DevelopmentHelp onLink={() => props.onOpenWeb?.("repos")} />
              ) : (
                artifacts.map((a) => (
                  <div key={a.url} className={s.rel}>
                    <span className={s.help}>{a.label}</span>
                    <LinkButton className={s.relTitle} onClick={() => props.onLink?.(a.url)}>
                      {a.comment ?? a.url}
                    </LinkButton>
                  </div>
                ))
              )}
            </FormSection>
            <FormSection title={S.form.relatedWork}>
              <div>
                <Button appearance="subtle" size="small" iconPosition="after" icon={<ChevronDownRegular />} onClick={() => props.onOpenWeb?.()}>
                  {S.form.addLink}
                </Button>
              </div>
              {!workLinks.some((r) => r.kind === "parent") && (
                <div className={s.help} style={{ backgroundColor: SURFACE.inset, padding: "8px" }}>
                  <LinkButton onClick={() => props.onOpenWeb?.()}>Add an existing work item as a parent</LinkButton>
                </div>
              )}
              {workLinks.length === 0 && <div className={s.help}>{S.form.relatedHelp}</div>}
              {workGroups.map((g) => (
                <div key={g.kind}>
                  <div style={{ fontSize: tokens.fontSizeBase300, margin: "6px 0 2px" }}>{g.kind === "parent" ? "Parent" : g.kind === "child" ? "Child" : "Related"}</div>
                  {g.items.map(relCard)}
                </div>
              ))}
            </FormSection>
            {groups
              .filter((g) => g.column === "side")
              .map((g) => (
                <FormSection key={g.title} title={g.title}>
                  {g.fields.map((def) => (
                    <PlanningField key={def.ref} def={def} value={draft[def.ref] ?? ""} disabled={locked} onChange={(value) => set(def.ref, value)} />
                  ))}
                </FormSection>
              ))}
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className={s.cols} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div className={s.section}>
            {props.history.length === 0 && <div className={s.help}>No history.</div>}
            {props.history.map((h) => (
              <div key={h.rev} className={s.comment}>
                <div className={s.commentHead}>
                  <PersonChip person={h.by} size={20} />
                  <span>{h.date ? new Date(h.date).toLocaleString() : ""}</span>
                  <span>{`Revision ${h.rev}`}</span>
                </div>
                {h.changes.map((c) => (
                  <div key={c.field} className={s.change}>
                    <strong>{c.field}</strong>
                    {c.from ? `: ${c.from} → ${c.to || "(empty)"}` : `: ${c.to || "(empty)"}`}
                  </div>
                ))}
                {h.changes.length === 0 && <div className={s.help}>No tracked field changed.</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "links" && (
        <div className={s.cols} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div className={s.section}>
            {otherLinks.length === 0 && <div className={s.help}>No links.</div>}
            {otherLinks.map((r) =>
              r.workItemId !== undefined ? (
                relCard(r)
              ) : (
                <div key={r.url} className={s.rel}>
                  <span className={s.help} style={{ minWidth: 50 }}>
                    {r.label}
                  </span>
                  <LinkButton onClick={() => props.onLink?.(r.url)}>{r.comment ?? r.url}</LinkButton>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {tab === "attachments" && (
        <div className={s.cols} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div className={s.section}>
            {attachments.length === 0 && <div className={s.help}>No attachments.</div>}
            {attachments.map((a) => (
              <div key={a.url} className={s.rel}>
                <LinkButton onClick={() => props.onLink?.(a.url)}>{a.name ?? a.url}</LinkButton>
                <span className={s.help}>{formatSize(a.size)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(props.error || props.saved) && (
        <div className={s.messages}>
          {props.error && (
            <MessageBar intent="error">
              <MessageBarBody>{props.error}</MessageBarBody>
            </MessageBar>
          )}
          {props.saved && (
            <MessageBar intent="success">
              <MessageBarBody>{props.saved}</MessageBarBody>
            </MessageBar>
          )}
        </div>
      )}
    </div>
  );
}
