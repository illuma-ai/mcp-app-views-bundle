/**
 * Controls that behave like the web form's fields (captures 16 to 21): a value is plain text at rest
 * and becomes a bordered editor only when clicked; a section title has a divider and hover icons; the
 * description is an inline rich text editor with a toolbar and a switch to a Markdown editor.
 */
import { Avatar, Dropdown, Input, Option, Textarea, makeStyles, tokens } from "@fluentui/react-components";
import {
  ArrowMaximizeRegular,
  ChevronUpRegular,
  PersonRegular,
  EmojiRegular,
  TextBoldRegular,
  TextBulletListLtrRegular,
  TextIndentDecreaseRegular,
  TextIndentIncreaseRegular,
  TextItalicRegular,
  TextNumberListLtrRegular,
  TextStrikethroughRegular,
  TextUnderlineRegular,
} from "@fluentui/react-icons";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { descriptionToHtml } from "../lib/form";
import { htmlToText, sanitizeHtml } from "../lib/sanitize";
import { LinkButton, initialsOf } from "./parts";

/** Measured on the real form at 1440 wide (see the spec): the sizes every control below follows. */
export const FORM_METRICS = {
  labelColumn: 60,
  rowHeight: 31,
  editorHeight: 29,
  editorPadding: "5px 11px",
  labelSize: 12,
  valueSize: 14,
  titleHeight: 33,
  titleSize: 17,
  sectionTitleSize: 16,
} as const;

const useStyles = makeStyles({
  inlineRow: { display: "grid", gridTemplateColumns: `${FORM_METRICS.labelColumn}px minmax(0, 1fr)`, alignItems: "center", gap: "6px", minHeight: `${FORM_METRICS.rowHeight}px`, minWidth: 0 },
  stackedRow: { display: "flex", flexDirection: "column", gap: "0", minWidth: 0 },
  // Labels and hints come from the theme palette (dark and light), never a fixed grey.
  label: { color: tokens.colorNeutralForeground3, fontSize: `${FORM_METRICS.labelSize}px`, lineHeight: "16px" },
  value: {
    "display": "flex",
    "alignItems": "center",
    "gap": "8px",
    "boxSizing": "border-box",
    "minHeight": `${FORM_METRICS.editorHeight}px`,
    "padding": FORM_METRICS.editorPadding,
    "border": "1px solid transparent",
    "borderRadius": "2px",
    "fontSize": `${FORM_METRICS.valueSize}px`,
    "lineHeight": "18px",
    "minWidth": 0,
    "cursor": "pointer",
    "overflow": "hidden",
    "textOverflow": "ellipsis",
    "whiteSpace": "nowrap",
    ":hover": { border: `1px solid ${tokens.colorNeutralStroke1}` },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}` },
  },
  readonly: { "cursor": "default", ":hover": { border: "1px solid transparent" } },
  editor: { minHeight: `${FORM_METRICS.editorHeight}px`, height: `${FORM_METRICS.editorHeight}px`, width: "100%", minWidth: 0, boxSizing: "border-box" },
  sectionHead: {
    "display": "flex",
    "alignItems": "center",
    "justifyContent": "space-between",
    "borderBottom": `1px solid ${tokens.colorNeutralStroke2}`,
    "minHeight": "34px",
    "& .k-hover": { opacity: 0 },
    ":hover .k-hover": { opacity: 1 },
    ":focus-within .k-hover": { opacity: 1 },
  },
  sectionTitle: { margin: 0, fontSize: `${FORM_METRICS.sectionTitleSize}px`, fontWeight: tokens.fontWeightSemibold, lineHeight: "22px" },
  iconButton: { background: "none", border: "none", padding: "4px", cursor: "pointer", color: tokens.colorNeutralForeground2, display: "inline-flex" },
  placeholder: { color: tokens.colorNeutralForeground3, fontStyle: "italic", fontSize: `${FORM_METRICS.valueSize}px`, padding: "6px 8px", cursor: "text", minHeight: "36px" },
  rich: {
    "border": `1px solid ${tokens.colorNeutralStroke1}`,
    "borderRadius": "2px",
    "backgroundColor": tokens.colorNeutralBackground1,
    ":focus-within": { border: `1px solid ${tokens.colorCompoundBrandStroke}` },
  },
  richBody: { minHeight: "56px", padding: "6px 8px", outline: "none", fontSize: `${FORM_METRICS.valueSize}px`, overflowWrap: "anywhere" },
  toolbar: { display: "flex", alignItems: "center", gap: "2px", padding: "4px 6px", flexWrap: "wrap" },
  tool: {
    "background": "none",
    "border": "none",
    "padding": "5px",
    "cursor": "pointer",
    "display": "inline-flex",
    "borderRadius": "2px",
    "color": tokens.colorNeutralForeground2,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  legacyNote: { display: "flex", justifyContent: "flex-start", gap: "4px", padding: "4px 0", fontSize: tokens.fontSizeBase300 },
  switch: { display: "flex", justifyContent: "flex-end", padding: "4px 0", fontSize: tokens.fontSizeBase200 },
});

export interface FieldOption {
  value: string;
  label?: string;
}

export interface ClickFieldProps {
  label: string;
  /** Shown after the label (the info icon of Start Date). */
  labelExtra?: ReactNode;
  /** "inline": label left in a 60px column (header grid). "stacked": label above (Planning). */
  layout: "inline" | "stacked";
  value: string;
  /** Text shown at rest when it differs from the value (a person's name, a path). */
  display?: ReactNode;
  /** Shown before the value (a state dot). */
  leading?: ReactNode;
  options?: FieldOption[];
  type?: "text" | "number" | "date";
  placeholder?: string;
  disabled?: boolean;
  /** Not editable (Reason): plain text only. */
  readOnly?: boolean;
  onChange?: (value: string) => void;
}

/** A field that is text at rest and an editor on click, with the label placed as the form does. */
export function ClickField(props: ClickFieldProps): ReactElement {
  const s = useStyles();
  const [editing, setEditing] = useState(false);
  const editable = !props.disabled && !props.readOnly;
  const current = props.options?.find((o) => o.value === props.value);
  const text = props.display ?? current?.label ?? props.value;
  const start = (): void => {
    if (editable) setEditing(true);
  };
  const done = (): void => setEditing(false);

  let body: ReactElement;
  if (editing && props.options) {
    const list = props.options.some((o) => o.value === props.value) || props.value === "" ? props.options : [...props.options, { value: props.value }];
    body = (
      <Dropdown
        className={s.editor}
        aria-label={props.label}
        defaultOpen
        autoFocus
        value={current?.label ?? props.value}
        selectedOptions={[props.value]}
        onOptionSelect={(_, d) => {
          props.onChange?.(d.optionValue ?? "");
          done();
        }}
        onOpenChange={(_, d) => {
          if (!d.open) done();
        }}>
        {list.map((o) => (
          <Option key={o.value} value={o.value} text={o.label ?? o.value}>
            {o.label ?? (o.value || " ")}
          </Option>
        ))}
      </Dropdown>
    );
  } else if (editing) {
    body = (
      <Input
        className={s.editor}
        aria-label={props.label}
        autoFocus
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(_, d) => props.onChange?.(d.value)}
        onBlur={done}
        onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && done()}
      />
    );
  } else {
    body = (
      <div
        className={`${s.value} ${editable ? "" : s.readonly}`}
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        aria-label={editable ? `${props.label}: ${String(text) || "empty"}. Edit` : undefined}
        title={typeof text === "string" ? text : undefined}
        onClick={start}
        onKeyDown={(e) => {
          if (editable && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            start();
          }
        }}>
        {props.leading}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {text !== "" && text !== undefined ? text : props.placeholder ? <span style={{ color: tokens.colorNeutralForeground3 }}>{props.placeholder}</span> : null}
        </span>
      </div>
    );
  }
  return (
    <div className={props.layout === "inline" ? s.inlineRow : s.stackedRow}>
      <span className={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {props.label}
        {props.labelExtra}
      </span>
      {body}
    </div>
  );
}

/** A section title with its divider; the icons appear on hover and the chevron collapses the section. */
export function FormSection({ title, children }: { title: string; children?: ReactNode }): ReactElement {
  const s = useStyles();
  const [open, setOpen] = useState(true);
  return (
    <>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{title}</h2>
        <span className="k-hover" style={{ display: "inline-flex" }}>
          <button type="button" className={s.iconButton} aria-label={`Expand ${title}`} title="Expand" onClick={() => setOpen(true)}>
            <ArrowMaximizeRegular fontSize={16} />
          </button>
          <button
            type="button"
            className={s.iconButton}
            aria-label={open ? `Collapse ${title}` : `Show ${title}`}
            aria-expanded={open}
            title={open ? "Collapse" : "Show"}
            onClick={() => setOpen((o) => !o)}>
            <ChevronUpRegular fontSize={16} style={{ transform: open ? undefined : "rotate(180deg)" }} />
          </button>
        </span>
      </div>
      {open && children}
    </>
  );
}

const TOOLS: { label: string; command: string; icon: ReactElement }[] = [
  { label: "Bold", command: "bold", icon: <TextBoldRegular fontSize={18} /> },
  { label: "Italic", command: "italic", icon: <TextItalicRegular fontSize={18} /> },
  { label: "Underline", command: "underline", icon: <TextUnderlineRegular fontSize={18} /> },
  { label: "Bulleted list", command: "insertUnorderedList", icon: <TextBulletListLtrRegular fontSize={18} /> },
  { label: "Numbered list", command: "insertOrderedList", icon: <TextNumberListLtrRegular fontSize={18} /> },
  { label: "Decrease indent", command: "outdent", icon: <TextIndentDecreaseRegular fontSize={18} /> },
  { label: "Increase indent", command: "indent", icon: <TextIndentIncreaseRegular fontSize={18} /> },
  { label: "Strikethrough", command: "strikeThrough", icon: <TextStrikethroughRegular fontSize={18} /> },
];

/** Cleaned HTML of an editor's content: only what the sanitizer keeps, so a paste cannot add active content. */
function cleanHtml(raw: string): string {
  return sanitizeHtml(raw).node.innerHTML;
}

export interface RichEditorProps {
  /** The text field's HTML. */
  html: string;
  label: string;
  disabled?: boolean;
  /** Fields stored as HTML only (Repro Steps, System Info) say how to convert them instead of offering the switch link. */
  legacy?: boolean;
  onChange: (html: string) => void;
  /** Called when the editor is closed with nothing typed (back to the placeholder). */
  onClose?: () => void;
}

/** The inline rich text editor: a toolbar, the editable area, and the switch to a Markdown editor. */
export function RichEditor(props: RichEditorProps): ReactElement {
  const s = useStyles();
  const ref = useRef<HTMLDivElement>(null);
  const [markdown, setMarkdown] = useState(false);
  const [text, setText] = useState(() => htmlToText(props.html));

  useEffect(() => {
    if (!markdown && ref.current) {
      ref.current.innerHTML = cleanHtml(props.html);
      ref.current.focus();
    }
    // Set once per mode switch: typing must not be overwritten by the value it just produced.
  }, [markdown]);

  const run = (command: string): void => {
    ref.current?.focus();
    document.execCommand(command);
    props.onChange(cleanHtml(ref.current?.innerHTML ?? ""));
  };
  return (
    <div>
      <div className={s.rich}>
        {markdown ? (
          <Textarea
            appearance="filled-lighter"
            rows={5}
            resize="vertical"
            style={{ width: "100%" }}
            aria-label={`${props.label} (Markdown)`}
            autoFocus
            value={text}
            disabled={props.disabled}
            onChange={(_, d) => {
              setText(d.value);
              props.onChange(descriptionToHtml(d.value));
            }}
          />
        ) : (
          <>
            <div
              ref={ref}
              className={s.richBody}
              contentEditable={!props.disabled}
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label={props.label}
              onInput={() => props.onChange(cleanHtml(ref.current?.innerHTML ?? ""))}
              onKeyDown={(e) => e.key === "Escape" && props.onClose?.()}
            />
            <div className={s.toolbar} role="toolbar" aria-label="Formatting">
              {TOOLS.map((t) => (
                <button
                  key={t.command}
                  type="button"
                  className={s.tool}
                  aria-label={t.label}
                  title={t.label}
                  disabled={props.disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => run(t.command)}>
                  {t.icon}
                </button>
              ))}
              <span className={s.tool} aria-hidden="true">
                <EmojiRegular fontSize={18} />
              </span>
            </div>
          </>
        )}
      </div>
      <div className={props.legacy ? s.legacyNote : s.switch}>
        {props.legacy && <span>We support markdown, you can </span>}
        <LinkButton
          onClick={() => {
            if (markdown) {
              setMarkdown(false);
            } else {
              setText(htmlToText(cleanHtml(ref.current?.innerHTML ?? props.html)));
              setMarkdown(true);
            }
          }}>
          {props.legacy ? "convert this field" : markdown ? "switch to rich text editor" : "switch to Markdown editor"}
        </LinkButton>
        {props.legacy && <span>.</span>}
      </div>
    </div>
  );
}

/** The description area: a placeholder or the rendered text at rest, the rich editor when clicked. */
export function ClickToEdit({
  empty,
  placeholder,
  canEdit,
  editing,
  onStart,
  children,
}: {
  empty: boolean;
  placeholder: string;
  canEdit: boolean;
  editing: boolean;
  onStart: () => void;
  children?: ReactNode;
}): ReactElement | null {
  const s = useStyles();
  if (editing) return null;
  return (
    <div
      role={canEdit ? "button" : undefined}
      tabIndex={canEdit ? 0 : undefined}
      aria-label={canEdit ? (empty ? placeholder : placeholder.replace(/^Click to add (.*)\.$/, "Edit $1")) : undefined}
      style={{ cursor: canEdit ? "text" : undefined }}
      className={empty ? s.placeholder : undefined}
      onClick={(e) => {
        if (canEdit && !(e.target as HTMLElement).closest("a")) onStart();
      }}
      onKeyDown={(e) => {
        if (canEdit && (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          onStart();
        }
      }}>
      {empty ? placeholder : children}
    </div>
  );
}

/** The "No one selected" control of the second header row: text at rest, an input when clicked. */
export function PersonField({ value, name, disabled, onChange }: { value: string; name?: string; disabled?: boolean; onChange: (value: string) => void }): ReactElement {
  const s = useStyles();
  const [editing, setEditing] = useState(false);
  const icon = name ? <Avatar name={name} initials={initialsOf(name)} size={24} color="colorful" /> : <PersonRegular fontSize={20} aria-hidden="true" />;
  if (editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: "180px" }}>
        {icon}
        <Input
          className={s.editor}
          aria-label="Assigned to"
          autoFocus
          placeholder="Name or email"
          value={value}
          onChange={(_, d) => onChange(d.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setEditing(false)}
        />
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: "180px" }}>
      {icon}
      <span
        className={`${s.value} ${disabled ? s.readonly : ""}`}
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? undefined : 0}
        aria-label={disabled ? undefined : `Assigned to: ${value || "No one selected"}. Edit`}
        onClick={() => !disabled && setEditing(true)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setEditing(true);
          }
        }}>
        {value || <span style={{ color: tokens.colorNeutralForeground3 }}>No one selected</span>}
      </span>
    </span>
  );
}
