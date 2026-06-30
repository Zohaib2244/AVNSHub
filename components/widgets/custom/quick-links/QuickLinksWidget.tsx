"use client";

import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Box,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  Code2,
  Copy,
  Cpu,
  CreditCard,
  Database,
  Download,
  FileText,
  Folder,
  FolderPlus,
  Github,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Link2,
  Lock,
  Mail,
  Map as MapIcon,
  MessageSquare,
  Monitor,
  Music,
  Package,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Server,
  Settings,
  Shield,
  ShoppingCart,
  Star,
  Terminal,
  Trash2,
  Upload,
  Video,
  Wifi,
  Wrench,
  X,
} from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";

type Accent = "orange" | "cyan" | "none";
type Density = "compact" | "comfy";
type Layout = "grid" | "list" | "grouped";
type AccentMode = "orange" | "cyan" | "mixed";

interface LinkItem {
  id: string;
  title: string;
  url: string;
  description: string;
  iconName: string;
  accent: Accent;
  tags: string[];
  pinned: boolean;
  groupId: string;
  createdAt: number;
}

interface LinkGroup {
  id: string;
  name: string;
}

interface QuickLinksStore {
  version: 1;
  groups: LinkGroup[];
  links: LinkItem[];
  recents: string[];
}

interface LinkDraft {
  title: string;
  url: string;
  description: string;
  iconName: string;
  accent: Accent;
  tags: string[];
  pinned: boolean;
  groupId: string;
}

const STORAGE_KEY = "nutmag-quick-links-v1";
const NEW_GROUP_VALUE = "__new__";
const DEFAULT_ICON_NAME = "Link2";

const ICONS: Record<string, LucideIcon> = {
  Activity,
  BarChart3,
  BookOpen,
  Box,
  Calendar,
  Cloud,
  Code2,
  Cpu,
  CreditCard,
  Database,
  FileText,
  Folder,
  Github,
  Globe,
  HardDrive,
  Image: ImageIcon,
  Layers,
  Link2,
  Lock,
  Mail,
  Map: MapIcon,
  MessageSquare,
  Monitor,
  Music,
  Package,
  Server,
  Settings,
  Shield,
  ShoppingCart,
  Star,
  Terminal,
  Video,
  Wifi,
  Wrench,
};

const ICON_NAMES = Object.keys(ICONS).sort((a, b) => a.localeCompare(b));

function getIcon(name: string): LucideIcon {
  return ICONS[name] ?? Link2;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildDefaultStore(): QuickLinksStore {
  const groups: LinkGroup[] = [
    { id: "dev", name: "dev" },
    { id: "docs", name: "docs" },
    { id: "tools", name: "tools" },
  ];
  const now = 0;
  const links: LinkItem[] = [
    {
      id: "starter-github",
      title: "GitHub",
      url: "https://github.com",
      description: "code and repos",
      iconName: "Github",
      accent: "orange",
      tags: ["git", "code"],
      pinned: true,
      groupId: "dev",
      createdAt: now,
    },
    {
      id: "starter-localhost",
      title: "Localhost:3000",
      url: "http://localhost:3000",
      description: "this app, running locally",
      iconName: "Server",
      accent: "cyan",
      tags: ["local", "dev"],
      pinned: true,
      groupId: "dev",
      createdAt: now,
    },
    {
      id: "starter-nextjs",
      title: "Next.js Docs",
      url: "https://nextjs.org/docs",
      description: "app router reference",
      iconName: "BookOpen",
      accent: "orange",
      tags: ["docs", "react"],
      pinned: false,
      groupId: "docs",
      createdAt: now,
    },
    {
      id: "starter-tailwind",
      title: "Tailwind Docs",
      url: "https://tailwindcss.com/docs",
      description: "utility classes reference",
      iconName: "FileText",
      accent: "cyan",
      tags: ["css", "docs"],
      pinned: false,
      groupId: "docs",
      createdAt: now,
    },
    {
      id: "starter-vercel",
      title: "Vercel",
      url: "https://vercel.com/dashboard",
      description: "deploys and hosting",
      iconName: "Cloud",
      accent: "orange",
      tags: ["deploy", "hosting"],
      pinned: false,
      groupId: "tools",
      createdAt: now,
    },
    {
      id: "starter-lucide",
      title: "Lucide Icons",
      url: "https://lucide.dev/icons",
      description: "icon search",
      iconName: "Box",
      accent: "cyan",
      tags: ["icons", "design"],
      pinned: false,
      groupId: "tools",
      createdAt: now,
    },
  ];
  return { version: 1, groups, links, recents: [] };
}

function isValidGroup(raw: unknown): raw is LinkGroup {
  if (!raw || typeof raw !== "object") return false;
  const g = raw as Record<string, unknown>;
  return typeof g.id === "string" && g.id.length > 0 && typeof g.name === "string" && g.name.length > 0;
}

function normalizeStoredLink(raw: unknown): LinkItem | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.title !== "string" || !l.title.trim()) return null;
  const normalizedUrl = typeof l.url === "string" ? normalizeUrl(l.url) : null;
  if (!normalizedUrl) return null;
  const accent: Accent = l.accent === "orange" || l.accent === "cyan" ? l.accent : "none";
  const tags = Array.isArray(l.tags)
    ? Array.from(
        new Set(
          l.tags
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        ),
      )
    : [];
  return {
    id: typeof l.id === "string" && l.id ? l.id : generateId(),
    title: l.title.trim(),
    url: normalizedUrl,
    description: typeof l.description === "string" ? l.description : "",
    iconName: typeof l.iconName === "string" && ICONS[l.iconName] ? l.iconName : DEFAULT_ICON_NAME,
    accent,
    tags,
    pinned: l.pinned === true,
    groupId: typeof l.groupId === "string" && l.groupId ? l.groupId : "tools",
    createdAt: typeof l.createdAt === "number" ? l.createdAt : Date.now(),
  };
}

function loadStore(): QuickLinksStore {
  if (typeof window === "undefined") return buildDefaultStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaultStore();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const groups = Array.isArray(parsed.groups) ? parsed.groups.filter(isValidGroup) : [];
    const linksRaw = Array.isArray(parsed.links) ? parsed.links : [];
    const links = linksRaw.map(normalizeStoredLink).filter((l): l is LinkItem => l !== null);
    const recents = Array.isArray(parsed.recents) ? parsed.recents.filter((r): r is string => typeof r === "string") : [];
    if (groups.length === 0 && links.length === 0) return buildDefaultStore();
    const finalGroups = groups.length > 0 ? groups : buildDefaultStore().groups;
    return { version: 1, groups: finalGroups, links, recents };
  } catch {
    return buildDefaultStore();
  }
}

function saveStore(store: QuickLinksStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage unavailable or full -- nothing to do
  }
}

function fallbackCopy(text: string, done: () => void) {
  if (typeof document === "undefined") return;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } catch {
    // ignore -- nothing more we can do
  }
  document.body.removeChild(textarea);
  done();
}

function resolveAccentVar(accent: Accent, mode: AccentMode): string {
  if (mode === "orange") return "var(--accent-orange)";
  if (mode === "cyan") return "var(--accent-cyan)";
  if (accent === "orange") return "var(--accent-orange)";
  if (accent === "cyan") return "var(--accent-cyan)";
  return "var(--text-muted)";
}

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };

// ---------- subcomponents (module scope so identity is stable across renders) ----------

interface LinkRowProps {
  link: LinkItem;
  groupName: string;
  showIcons: boolean;
  showDescriptions: boolean;
  showGroupTag: boolean;
  accentMode: AccentMode;
  showActions: boolean;
  allowManage: boolean;
  copied: boolean;
  onOpen: (link: LinkItem) => void;
  onCopy: (link: LinkItem) => void;
  onTogglePin: (link: LinkItem) => void;
  onEdit: (link: LinkItem) => void;
  onDelete: (link: LinkItem) => void;
}

function LinkRow({
  link,
  groupName,
  showIcons,
  showDescriptions,
  showGroupTag,
  accentMode,
  showActions,
  allowManage,
  copied,
  onOpen,
  onCopy,
  onTogglePin,
  onEdit,
  onDelete,
}: LinkRowProps) {
  const Icon = getIcon(link.iconName);
  const accentVar = resolveAccentVar(link.accent, accentMode);
  return (
    <div className="ql-row">
      <button type="button" className="ql-row-main" onClick={() => onOpen(link)} title={link.url}>
        {showIcons && (
          <span className="ql-icon" style={{ color: accentVar }}>
            <Icon size={14} strokeWidth={1.75} />
          </span>
        )}
        <span className="ql-row-text">
          <span className="ql-title" style={monoStyle}>
            {link.title}
            {link.pinned && <Star size={10} strokeWidth={2} className="ql-pin-mark" />}
          </span>
          {showDescriptions && link.description && (
            <span className="block-sub ql-desc">{link.description}</span>
          )}
          {(link.tags.length > 0 || showGroupTag) && (
            <span className="ql-tags">
              {showGroupTag && <span className="ql-tag ql-tag-group">{groupName}</span>}
              {link.tags.map((tag) => (
                <span key={tag} className="ql-tag">
                  {tag}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
      {showActions && (
        <span className="ql-actions">
          <button
            type="button"
            className="ql-btn"
            title={link.pinned ? "unpin" : "pin"}
            aria-label={link.pinned ? "unpin link" : "pin link"}
            onClick={() => onTogglePin(link)}
          >
            {link.pinned ? <PinOff size={13} strokeWidth={1.75} /> : <Pin size={13} strokeWidth={1.75} />}
          </button>
          <button
            type="button"
            className="ql-btn"
            title="copy url"
            aria-label="copy url"
            onClick={() => onCopy(link)}
          >
            {copied ? <Check size={13} strokeWidth={1.75} /> : <Copy size={13} strokeWidth={1.75} />}
          </button>
          {allowManage && (
            <>
              <button
                type="button"
                className="ql-btn"
                title="edit link"
                aria-label="edit link"
                onClick={() => onEdit(link)}
              >
                <Pencil size={13} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="ql-btn"
                title="delete link"
                aria-label="delete link"
                onClick={() => onDelete(link)}
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            </>
          )}
        </span>
      )}
    </div>
  );
}

interface LinkFormProps {
  editingId: string | null;
  initialDraft: LinkDraft;
  groups: LinkGroup[];
  onCancel: () => void;
  onSave: (draft: LinkDraft, editingId: string | null) => void;
  onCreateGroup: (name: string) => string;
}

function LinkForm({ editingId, initialDraft, groups, onCancel, onSave, onCreateGroup }: LinkFormProps) {
  const [title, setTitle] = useState(initialDraft.title);
  const [url, setUrl] = useState(initialDraft.url);
  const [description, setDescription] = useState(initialDraft.description);
  const [iconName, setIconName] = useState(initialDraft.iconName);
  const [accent, setAccent] = useState<Accent>(initialDraft.accent);
  const [tagsInput, setTagsInput] = useState(initialDraft.tags.join(", "));
  const [pinned, setPinned] = useState(initialDraft.pinned);
  const [groupId, setGroupId] = useState(initialDraft.groupId);
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("title is required");
      return;
    }
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      setError("enter a valid url, e.g. example.com");
      return;
    }
    let finalGroupId = groupId;
    if (groupId === NEW_GROUP_VALUE) {
      const trimmedGroup = newGroupName.trim();
      if (!trimmedGroup) {
        setError("enter a name for the new group");
        return;
      }
      finalGroupId = onCreateGroup(trimmedGroup);
    }
    const tags = Array.from(
      new Set(
        tagsInput
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    onSave(
      { title: trimmedTitle, url: normalizedUrl, description: description.trim(), iconName, accent, tags, pinned, groupId: finalGroupId },
      editingId,
    );
  }

  function handleKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  }

  const PreviewIcon = getIcon(iconName);

  return (
    <form className="ql-form" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
      <div className="ql-form-head">
        <span className="block-label">{editingId ? "edit link" : "add link"}</span>
        <button type="button" className="ql-btn" title="cancel" aria-label="cancel" onClick={onCancel}>
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>

      <div className="ql-field">
        <label className="ql-field-label" htmlFor="ql-f-title">
          title
        </label>
        <input
          id="ql-f-title"
          className="ql-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="display name"
          autoFocus
        />
      </div>

      <div className="ql-field">
        <label className="ql-field-label" htmlFor="ql-f-url">
          url
        </label>
        <input
          id="ql-f-url"
          className="ql-input"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="example.com"
        />
      </div>

      <div className="ql-field">
        <label className="ql-field-label" htmlFor="ql-f-desc">
          description
        </label>
        <input
          id="ql-f-desc"
          className="ql-input"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="optional"
        />
      </div>

      <div className="ql-field-row">
        <div className="ql-field">
          <label className="ql-field-label" htmlFor="ql-f-icon">
            icon
          </label>
          <div className="ql-icon-pick">
            <span className="ql-icon-preview">
              <PreviewIcon size={14} strokeWidth={1.75} />
            </span>
            <select id="ql-f-icon" className="ql-input" value={iconName} onChange={(e) => setIconName(e.target.value)}>
              {ICON_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="ql-field">
          <span className="ql-field-label">accent</span>
          <div className="ql-accent-pick">
            {(["none", "orange", "cyan"] as Accent[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`ql-accent-swatch${accent === value ? " ql-accent-swatch-active" : ""}`}
                style={{ color: value === "none" ? "var(--text-muted)" : `var(--accent-${value})` }}
                aria-pressed={accent === value}
                aria-label={`accent ${value}`}
                title={value}
                onClick={() => setAccent(value)}
              >
                <Star size={12} strokeWidth={1.75} fill={accent === value ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ql-field">
        <label className="ql-field-label" htmlFor="ql-f-tags">
          tags (comma separated)
        </label>
        <input
          id="ql-f-tags"
          className="ql-input"
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="git, deploy"
        />
      </div>

      <div className="ql-field">
        <label className="ql-field-label" htmlFor="ql-f-group">
          group
        </label>
        <select id="ql-f-group" className="ql-input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          <option value={NEW_GROUP_VALUE}>+ new group...</option>
        </select>
        {groupId === NEW_GROUP_VALUE && (
          <input
            className="ql-input"
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="new group name"
            style={{ marginTop: 6 }}
          />
        )}
      </div>

      <label className="ql-checkbox-row">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        <span>pinned</span>
      </label>

      {error && <div className="ql-error">{error}</div>}

      <div className="ql-form-actions">
        <button type="button" className="ql-btn-text" onClick={onCancel}>
          cancel
        </button>
        <button type="submit" className="ql-btn-primary">
          {editingId ? "save" : "add link"}
        </button>
      </div>
    </form>
  );
}

// ---------- main widget ----------

export function QuickLinksWidget() {
  const { size, settings } = useWidget();

  const density: Density = settings.density === "comfy" ? "comfy" : "compact";
  const layout: Layout = settings.layout === "grid" || settings.layout === "list" ? settings.layout : "grouped";
  const showDescriptions = settings.showDescriptions !== false;
  const showIcons = settings.showIcons !== false;
  const showSearch = settings.showSearch !== false;
  const openNewTab = settings.openNewTab !== false;
  const accentMode: AccentMode = settings.accentMode === "orange" || settings.accentMode === "cyan" ? settings.accentMode : "mixed";
  const maxVisible = typeof settings.maxVisible === "number" && settings.maxVisible > 0 ? settings.maxVisible : 6;

  const [store, setStore] = useState<QuickLinksStore>(() => buildDefaultStore());
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"new" | { editId: string } | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [newTopGroupName, setNewTopGroupName] = useState("");
  const [groupsExpanded, setGroupsExpanded] = useState(false);

  const copyTimeoutRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setStore(loadStore());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveStore(store);
  }, [store, hydrated]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const allowManage = size === "L";
  const groupNameById = useMemo(() => new Map(store.groups.map((g) => [g.id, g.name])), [store.groups]);

  const filteredLinks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return store.links;
    return store.links.filter((l) => {
      const groupName = (groupNameById.get(l.groupId) ?? "").toLowerCase();
      return (
        l.title.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        groupName.includes(q) ||
        l.tags.some((t) => t.includes(q))
      );
    });
  }, [store.links, query, groupNameById]);

  const cappedAllowedIds = useMemo(() => {
    if (size === "L") return null;
    const ordered = [...filteredLinks].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt,
    );
    return new Set(ordered.slice(0, maxVisible).map((l) => l.id));
  }, [filteredLinks, size, maxVisible]);

  const visibleLinks = useMemo(
    () => (cappedAllowedIds ? filteredLinks.filter((l) => cappedAllowedIds.has(l.id)) : filteredLinks),
    [filteredLinks, cappedAllowedIds],
  );

  const pinnedLinks = useMemo(() => filteredLinks.filter((l) => l.pinned), [filteredLinks]);
  const sTierLinks = useMemo(() => {
    const base = pinnedLinks.length > 0 ? pinnedLinks : filteredLinks;
    return base.slice(0, maxVisible);
  }, [pinnedLinks, filteredLinks, maxVisible]);

  const recentLinks = useMemo(() => {
    const byId = new Map(store.links.map((l) => [l.id, l]));
    return store.recents.map((id) => byId.get(id)).filter((l): l is LinkItem => !!l);
  }, [store.recents, store.links]);

  function openLink(link: LinkItem) {
    if (typeof window !== "undefined") {
      if (openNewTab) {
        window.open(link.url, "_blank", "noopener,noreferrer");
      } else {
        window.open(link.url, "_self");
      }
    }
    setStore((prev) => ({
      ...prev,
      recents: [link.id, ...prev.recents.filter((id) => id !== link.id)].slice(0, 8),
    }));
  }

  function copyLink(link: LinkItem) {
    const finish = () => {
      setCopiedId(link.id);
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopiedId(null), 1500);
    };
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link.url).then(finish).catch(() => fallbackCopy(link.url, finish));
    } else {
      fallbackCopy(link.url, finish);
    }
  }

  function togglePin(link: LinkItem) {
    setStore((prev) => ({
      ...prev,
      links: prev.links.map((l) => (l.id === link.id ? { ...l, pinned: !l.pinned } : l)),
    }));
  }

  function deleteLink(link: LinkItem) {
    if (typeof window !== "undefined" && !window.confirm(`delete "${link.title}"?`)) return;
    setStore((prev) => ({
      ...prev,
      links: prev.links.filter((l) => l.id !== link.id),
      recents: prev.recents.filter((id) => id !== link.id),
    }));
  }

  function saveLink(draft: LinkDraft, editingId: string | null) {
    setStore((prev) => {
      if (editingId) {
        return { ...prev, links: prev.links.map((l) => (l.id === editingId ? { ...l, ...draft } : l)) };
      }
      const newLink: LinkItem = { id: generateId(), createdAt: Date.now(), ...draft };
      return { ...prev, links: [...prev.links, newLink] };
    });
    setFormMode(null);
  }

  function createGroup(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return store.groups[0]?.id ?? "";
    let id = slugify(trimmed) || generateId();
    if (store.groups.some((g) => g.id === id)) id = `${id}-${generateId().slice(0, 4)}`;
    setStore((prev) => ({ ...prev, groups: [...prev.groups, { id, name: trimmed }] }));
    return id;
  }

  function renameGroup(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setStore((prev) => ({ ...prev, groups: prev.groups.map((g) => (g.id === id ? { ...g, name: trimmed } : g)) }));
  }

  function deleteGroup(id: string) {
    if (store.groups.length <= 1) {
      window.alert("at least one group is required");
      return;
    }
    if (store.links.some((l) => l.groupId === id)) {
      window.alert("move or delete this group's links first");
      return;
    }
    setStore((prev) => ({ ...prev, groups: prev.groups.filter((g) => g.id !== id) }));
  }

  function exportJson() {
    const data = JSON.stringify({ version: 1, groups: store.groups, links: store.links }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quick-links-export.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Record<string, unknown>;
        const importedGroups = Array.isArray(parsed.groups) ? parsed.groups.filter(isValidGroup) : [];
        const importedLinksRaw = Array.isArray(parsed.links) ? parsed.links : [];
        const importedLinks = importedLinksRaw.map(normalizeStoredLink).filter((l): l is LinkItem => l !== null);
        if (importedGroups.length === 0 && importedLinks.length === 0) {
          window.alert("no valid links or groups found in this file");
          return;
        }
        const ok = window.confirm(`import ${importedLinks.length} link(s) and ${importedGroups.length} group(s)?`);
        if (!ok) return;
        setStore((prev) => {
          const groupMap = new Map(prev.groups.map((g) => [g.id, g]));
          for (const g of importedGroups) groupMap.set(g.id, g);
          const linkMap = new Map(prev.links.map((l) => [l.id, l]));
          for (const l of importedLinks) linkMap.set(l.id, l);
          return { ...prev, groups: Array.from(groupMap.values()), links: Array.from(linkMap.values()) };
        });
      } catch {
        window.alert("could not read this file as quick links json");
      }
    };
    reader.readAsText(file);
  }

  function startEdit(link: LinkItem) {
    setFormMode({ editId: link.id });
  }

  function startNew() {
    setFormMode("new");
  }

  const editingLink = formMode && typeof formMode === "object" ? store.links.find((l) => l.id === formMode.editId) ?? null : null;
  const formDraft: LinkDraft | null = formMode
    ? editingLink
      ? {
          title: editingLink.title,
          url: editingLink.url,
          description: editingLink.description,
          iconName: editingLink.iconName,
          accent: editingLink.accent,
          tags: editingLink.tags,
          pinned: editingLink.pinned,
          groupId: editingLink.groupId,
        }
      : {
          title: "",
          url: "",
          description: "",
          iconName: DEFAULT_ICON_NAME,
          accent: "none",
          tags: [],
          pinned: false,
          groupId: store.groups[0]?.id ?? "",
        }
    : null;

  function renderRow(link: LinkItem, showActions: boolean, showGroupTag: boolean) {
    return (
      <LinkRow
        key={link.id}
        link={link}
        groupName={groupNameById.get(link.groupId) ?? ""}
        showIcons={showIcons}
        showDescriptions={showDescriptions}
        showGroupTag={showGroupTag}
        accentMode={accentMode}
        showActions={showActions}
        allowManage={allowManage}
        copied={copiedId === link.id}
        onOpen={openLink}
        onCopy={copyLink}
        onTogglePin={togglePin}
        onEdit={startEdit}
        onDelete={deleteLink}
      />
    );
  }

  return (
    <div className="ql-root" data-size={size} data-density={density}>
      <style>{`
        .ql-root { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 8px; }
        .ql-toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .ql-search-wrap { position: relative; flex: 1 1 120px; min-width: 90px; }
        .ql-search-icon { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
        .ql-search-input { width: 100%; box-sizing: border-box; padding: 6px 8px 6px 26px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--bg-nested); color: var(--text-primary); font-size: 0.78rem; }
        .ql-search-input:focus-visible { outline: 1.5px solid var(--accent-cyan); outline-offset: 1px; }
        .ql-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        .ql-section { display: flex; flex-direction: column; gap: 4px; }
        .ql-section-title { display: flex; align-items: center; gap: 4px; color: var(--text-muted); }
        .ql-row-list { display: flex; flex-direction: column; gap: 2px; }
        .ql-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px; }
        .ql-row { display: flex; align-items: center; gap: 4px; border-radius: 10px; padding: 2px; }
        [data-density="comfy"] .ql-row { padding: 4px 2px; }
        .ql-row:hover, .ql-row:focus-within { background: var(--bg-nested); }
        .ql-row-main { display: flex; align-items: center; gap: 7px; flex: 1 1 auto; min-width: 0; background: none; border: none; cursor: pointer; padding: 3px 4px; text-align: left; color: inherit; border-radius: 8px; }
        .ql-row-main:focus-visible { outline: 1.5px solid var(--accent-orange); outline-offset: 1px; }
        .ql-icon { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
        .ql-row-text { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
        .ql-title { font-size: 0.78rem; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px; }
        .ql-pin-mark { color: var(--accent-orange); flex: 0 0 auto; }
        .ql-desc { font-size: 0.68rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ql-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 1px; }
        .ql-tag { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); background: var(--bg-nested); border: 1px solid var(--border); border-radius: 6px; padding: 1px 5px; }
        .ql-tag-group { color: var(--text-primary); }
        .ql-actions { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; flex-wrap: wrap; }
        .ql-btn { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 7px; border: 1.5px solid transparent; background: none; color: var(--text-muted); cursor: pointer; }
        .ql-btn:hover { color: var(--text-primary); border-color: var(--border); }
        .ql-btn:focus-visible { outline: 1.5px solid var(--accent-cyan); outline-offset: 1px; }
        .ql-btn-text { background: none; border: none; color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer; padding: 4px 6px; }
        .ql-btn-text:hover { color: var(--text-primary); }
        .ql-btn-text:focus-visible { outline: 1.5px solid var(--accent-cyan); outline-offset: 1px; }
        .ql-btn-primary { background: var(--accent-orange); color: var(--bg-card); border: 1.5px solid var(--border); border-radius: 10px; box-shadow: 2px 2px 0 var(--shadow); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; padding: 5px 10px; cursor: pointer; font-family: var(--font-dot-gothic), monospace; }
        .ql-btn-primary:focus-visible { outline: 1.5px solid var(--accent-cyan); outline-offset: 2px; }
        .ql-card { display: flex; flex-direction: column; gap: 4px; background: var(--bg-nested); border: 1.5px solid var(--border); border-radius: 12px; box-shadow: 2px 2px 0 var(--shadow); padding: 8px; }
        .ql-card .ql-row-main { padding: 0; flex-direction: column; align-items: flex-start; width: 100%; }
        .ql-card .ql-row { flex-direction: column; align-items: stretch; gap: 6px; padding: 0; }
        .ql-card .ql-actions { justify-content: flex-end; }
        .ql-group-header { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 2px 2px; }
        .ql-group-name { color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.62rem; }
        .ql-group-actions { display: flex; gap: 2px; }
        .ql-empty { color: var(--text-muted); font-size: 0.72rem; padding: 8px 2px; text-align: center; }
        .ql-form { display: flex; flex-direction: column; gap: 8px; background: var(--bg-nested); border: 1.5px solid var(--border); border-radius: 12px; box-shadow: 3px 3px 0 var(--shadow); padding: 10px; }
        .ql-form-head { display: flex; align-items: center; justify-content: space-between; }
        .ql-field { display: flex; flex-direction: column; gap: 3px; }
        .ql-field-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .ql-field-row .ql-field { flex: 1 1 120px; }
        .ql-field-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
        .ql-input { width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 9px; border: 1.5px solid var(--border); background: var(--bg-card); color: var(--text-primary); font-size: 0.76rem; font-family: var(--font-jetbrains-mono), monospace; }
        .ql-input:focus-visible { outline: 1.5px solid var(--accent-cyan); outline-offset: 1px; }
        .ql-icon-pick { display: flex; align-items: center; gap: 6px; }
        .ql-icon-preview { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; flex: 0 0 auto; border-radius: 8px; border: 1.5px solid var(--border); background: var(--bg-card); color: var(--accent-orange); }
        .ql-accent-pick { display: flex; gap: 4px; }
        .ql-accent-swatch { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--bg-card); cursor: pointer; }
        .ql-accent-swatch-active { border-color: currentColor; }
        .ql-checkbox-row { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--text-primary); cursor: pointer; }
        .ql-error { font-size: 0.7rem; color: var(--accent-orange); }
        .ql-form-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .ql-groups-panel { display: flex; flex-direction: column; gap: 6px; background: var(--bg-nested); border: 1.5px solid var(--border); border-radius: 12px; padding: 8px; }
        .ql-group-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .ql-group-chip { display: flex; align-items: center; gap: 4px; border: 1.5px solid var(--border); border-radius: 8px; padding: 2px 4px 2px 8px; font-size: 0.68rem; background: var(--bg-card); }
        .ql-group-add-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .ql-group-add-row .ql-input { flex: 1 1 120px; min-width: 0; }
        .ql-recents-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .ql-recent-chip { display: flex; align-items: center; gap: 5px; border: 1.5px solid var(--border); border-radius: 8px; padding: 3px 8px; background: var(--bg-nested); cursor: pointer; font-size: 0.68rem; color: var(--text-primary); }
        .ql-recent-chip:hover { border-color: var(--accent-cyan); }
        .ql-recent-chip:focus-visible { outline: 1.5px solid var(--accent-cyan); outline-offset: 1px; }
        @container widget (max-width: 220px) {
          .ql-toolbar { flex-direction: column; align-items: stretch; }
          .ql-field-row { flex-direction: column; }
          .ql-form-actions { flex-wrap: wrap; }
          .ql-grid { grid-template-columns: minmax(0, 1fr); }
          .ql-group-add-row { flex-direction: column; }
        }
      `}</style>

      {showSearch && (
        <div className="ql-toolbar">
          <div className="ql-search-wrap">
            <span className="ql-search-icon">
              <Search size={13} strokeWidth={1.75} />
            </span>
            <input
              className="ql-search-input"
              style={monoStyle}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search links, tags, groups"
              aria-label="search quick links"
            />
          </div>
          {size === "L" && (
            <button type="button" className="ql-btn-primary" onClick={startNew} title="add link">
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Plus size={13} strokeWidth={2} /> add
              </span>
            </button>
          )}
        </div>
      )}

      {size === "L" && !showSearch && (
        <div className="ql-toolbar">
          <button type="button" className="ql-btn-primary" onClick={startNew} title="add link">
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Plus size={13} strokeWidth={2} /> add link
            </span>
          </button>
        </div>
      )}

      {formMode && formDraft && (
        <LinkForm
          key={typeof formMode === "object" ? formMode.editId : "new"}
          editingId={typeof formMode === "object" ? formMode.editId : null}
          initialDraft={formDraft}
          groups={store.groups}
          onCancel={() => setFormMode(null)}
          onSave={saveLink}
          onCreateGroup={createGroup}
        />
      )}

      <div className="ql-scroll">
        {size === "S" && (
          <div className="ql-section">
            <div className="ql-section-title">
              <Star size={11} strokeWidth={1.75} />
              <span className="block-label">{pinnedLinks.length > 0 ? "pinned" : "top links"}</span>
            </div>
            <div className="ql-row-list">
              {sTierLinks.length === 0 && <div className="ql-empty">no links yet</div>}
              {sTierLinks.map((link) => renderRow(link, false, false))}
            </div>
          </div>
        )}

        {size !== "S" && !formMode && (
          <>
            {pinnedLinks.length > 0 && (
              <div className="ql-section">
                <div className="ql-section-title">
                  <Star size={11} strokeWidth={1.75} />
                  <span className="block-label">pinned</span>
                </div>
                <div className="ql-row-list">
                  {pinnedLinks.slice(0, size === "L" ? undefined : maxVisible).map((link) => renderRow(link, true, layout !== "grouped"))}
                </div>
              </div>
            )}

            {size === "L" && recentLinks.length > 0 && (
              <div className="ql-section">
                <div className="ql-section-title">
                  <Clock size={11} strokeWidth={1.75} />
                  <span className="block-label">recent</span>
                </div>
                <div className="ql-recents-row">
                  {recentLinks.map((link) => {
                    const Icon = getIcon(link.iconName);
                    return (
                      <button
                        key={link.id}
                        type="button"
                        className="ql-recent-chip"
                        onClick={() => openLink(link)}
                        title={link.url}
                      >
                        {showIcons && <Icon size={12} strokeWidth={1.75} style={{ color: resolveAccentVar(link.accent, accentMode) }} />}
                        <span style={monoStyle}>{link.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="ql-section">
              <div className="ql-section-title">
                <span className="block-label">links</span>
              </div>

              {layout === "grouped" ? (
                store.groups.map((group) => {
                  const groupLinks = visibleLinks.filter((l) => l.groupId === group.id);
                  if (groupLinks.length === 0) return null;
                  return (
                    <div className="ql-section" key={group.id}>
                      <div className="ql-group-header">
                        {editingGroupId === group.id ? (
                          <input
                            className="ql-input"
                            style={{ maxWidth: 160 }}
                            value={groupNameDraft}
                            autoFocus
                            onChange={(e) => setGroupNameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                renameGroup(group.id, groupNameDraft);
                                setEditingGroupId(null);
                              } else if (e.key === "Escape") {
                                setEditingGroupId(null);
                              }
                            }}
                            onBlur={() => {
                              renameGroup(group.id, groupNameDraft);
                              setEditingGroupId(null);
                            }}
                          />
                        ) : (
                          <span className="ql-group-name more-head">{group.name}</span>
                        )}
                        {allowManage && editingGroupId !== group.id && (
                          <span className="ql-group-actions">
                            <button
                              type="button"
                              className="ql-btn"
                              title="rename group"
                              aria-label="rename group"
                              onClick={() => {
                                setEditingGroupId(group.id);
                                setGroupNameDraft(group.name);
                              }}
                            >
                              <Pencil size={12} strokeWidth={1.75} />
                            </button>
                          </span>
                        )}
                      </div>
                      <div className="ql-row-list">{groupLinks.map((link) => renderRow(link, true, false))}</div>
                    </div>
                  );
                })
              ) : layout === "grid" ? (
                <div className="ql-grid">
                  {visibleLinks.map((link) => (
                    <div className="ql-card" key={link.id}>
                      {renderRow(link, true, true)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ql-row-list">{visibleLinks.map((link) => renderRow(link, true, true))}</div>
              )}

              {visibleLinks.length === 0 && <div className="ql-empty">no links match</div>}
            </div>

            {size === "L" && (
              <div className="ql-groups-panel">
                <button
                  type="button"
                  className="ql-btn-text"
                  style={{ display: "flex", alignItems: "center", gap: 4, alignSelf: "flex-start", padding: 0 }}
                  onClick={() => setGroupsExpanded((v) => !v)}
                >
                  {groupsExpanded ? <ChevronUp size={12} strokeWidth={1.75} /> : <ChevronDown size={12} strokeWidth={1.75} />}
                  manage groups
                </button>
                {groupsExpanded && (
                  <>
                    <div className="ql-group-chip-row">
                      {store.groups.map((g) => (
                        <span className="ql-group-chip" key={g.id} style={monoStyle}>
                          <Folder size={11} strokeWidth={1.75} />
                          {g.name}
                          <button
                            type="button"
                            className="ql-btn"
                            style={{ width: 16, height: 16 }}
                            title="delete group"
                            aria-label={`delete group ${g.name}`}
                            onClick={() => deleteGroup(g.id)}
                          >
                            <X size={11} strokeWidth={1.75} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="ql-group-add-row">
                      <input
                        className="ql-input"
                        type="text"
                        placeholder="new group name"
                        value={newTopGroupName}
                        onChange={(e) => setNewTopGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            createGroup(newTopGroupName);
                            setNewTopGroupName("");
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="ql-btn"
                        title="add group"
                        aria-label="add group"
                        onClick={() => {
                          createGroup(newTopGroupName);
                          setNewTopGroupName("");
                        }}
                      >
                        <FolderPlus size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {size === "L" && (
              <div className="ql-toolbar">
                <button type="button" className="ql-btn-text" onClick={exportJson} title="export all links as json">
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Download size={12} strokeWidth={1.75} /> export
                  </span>
                </button>
                <button
                  type="button"
                  className="ql-btn-text"
                  onClick={() => fileInputRef.current?.click()}
                  title="import links from json"
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Upload size={12} strokeWidth={1.75} /> import
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  style={{ display: "none" }}
                  onChange={handleImportFile}
                  aria-hidden="true"
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
