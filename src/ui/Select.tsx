import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Check, ChevronDown } from "lucide-react";

interface Item {
  kind: "option" | "group";
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

const textOf = (node: ReactNode): string =>
  node == null || typeof node === "boolean"
    ? ""
    : typeof node === "string" || typeof node === "number"
      ? String(node)
      : Array.isArray(node)
        ? node.map(textOf).join("")
        : isValidElement<{ children?: ReactNode }>(node)
          ? textOf(node.props.children)
          : "";

function flatten(children: ReactNode, out: Item[] = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return;
    const props = child.props as { children?: ReactNode; value?: unknown; disabled?: boolean; label?: string };
    if (child.type === Fragment) flatten(props.children, out);
    else if (child.type === "optgroup") {
      out.push({ kind: "group", value: "", label: props.label });
      flatten(props.children, out);
    } else if (child.type === "option")
      out.push({
        kind: "option",
        value: props.value === undefined ? textOf(props.children) : String(props.value),
        label: props.children,
        disabled: props.disabled,
      });
  });
  return out;
}

/**
 * Game-styled dropdown. A visually hidden native <select> keeps keyboard,
 * screen-reader and form behaviour (and existing tests) intact; the visible
 * part is a custom button with a floating option list.
 */
export default function Select({
  className = "",
  style,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const items = flatten(children);
  const options = items.filter((i) => i.kind === "option");
  const [inner, setInner] = useState(defaultValue === undefined ? undefined : String(defaultValue));
  const current = value !== undefined ? String(value) : (inner ?? options[0]?.value);
  const selected = options.find((o) => o.value === current) ?? options[0];
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; up: boolean; max: number }>();
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const native = useRef<HTMLSelectElement>(null);

  const place = () => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 240 && r.top > below;
    setRect({
      left: r.left,
      top: up ? r.top - 4 : r.bottom + 4,
      width: r.width,
      up,
      max: Math.max(160, Math.min(380, (up ? r.top : below) - 16)),
    });
  };
  useLayoutEffect(() => {
    if (open) place();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      const target = event.target as Node;
      if (pop.current?.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const reflow = (event: Event) => {
      if (pop.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", reflow);
    window.addEventListener("scroll", reflow, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", reflow);
      window.removeEventListener("scroll", reflow, true);
    };
  }, [open]);
  useEffect(() => {
    if (open) pop.current?.querySelector<HTMLElement>(".selected")?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const commit = (next: string) => {
    setOpen(false);
    if (next === current) return;
    setInner(next);
    const el = native.current;
    if (el) el.value = next;
    // Handlers read event.target.value, like a native change event.
    const target = el ?? ({ value: next } as HTMLSelectElement);
    onChange?.({ target, currentTarget: target } as ChangeEvent<HTMLSelectElement>);
  };

  return (
    <span className={`ui-select ${className} ${open ? "open" : ""} ${disabled ? "disabled" : ""}`} style={style}>
      <select
        {...rest}
        ref={native}
        className="ui-select-native"
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        disabled={disabled}
        onChange={(event) => {
          setInner(event.target.value);
          onChange?.(event);
        }}
      >
        {children}
      </select>
      <button
        type="button"
        ref={trigger}
        tabIndex={-1}
        aria-hidden="true"
        className="ui-select-trigger"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{selected?.label ?? "—"}</span>
        <ChevronDown size={15} />
      </button>
      {open && rect && (
        <div
          ref={pop}
          className={`ui-select-pop ${rect.up ? "up" : ""}`}
          aria-hidden="true"
          style={{
            left: rect.left,
            top: rect.up ? undefined : rect.top,
            bottom: rect.up ? window.innerHeight - rect.top : undefined,
            minWidth: rect.width,
            maxHeight: rect.max,
          }}
        >
          {items.map((item, i) =>
            item.kind === "group" ? (
              <div key={`g${i}`} className="ui-select-group">
                {item.label}
              </div>
            ) : (
              <button
                key={`${item.value}-${i}`}
                type="button"
                tabIndex={-1}
                disabled={item.disabled}
                className={item.value === current ? "selected" : ""}
                onClick={() => commit(item.value)}
              >
                <span>{item.label}</span>
                {item.value === current && <Check size={14} />}
              </button>
            ),
          )}
        </div>
      )}
    </span>
  );
}
