"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CertificateBreadcrumbs } from "@/components/certificates/CertificateBreadcrumbs";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  createCertificateTemplate,
  deleteCertificateTemplateAsset,
  getAllExams,
  getCertificateFieldCatalog,
  getCertificateTemplateAssetUrl,
  getDefaultCertificateLayout,
  listCertificateTemplateAssets,
  listCertificateTemplates,
  updateCertificateTemplate,
  uploadCertificateTemplateAsset,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  CertificateFieldCatalogItem,
  CertificateLayoutField,
  CertificateLayoutJson,
  CertificateSubjectColumn,
  CertificateTemplate,
  CertificateTemplateAsset,
  Exam,
} from "@/types/document";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  ImageIcon,
  ImagePlus,
  List,
  Loader2,
  Maximize2,
  Plus,
  Save,
  Settings2,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";

const assetUrlCache = new Map<string, string>();
let defaultLayoutCache: CertificateLayoutJson | null = null;

async function cachedDefaultLayout(): Promise<CertificateLayoutJson> {
  if (!defaultLayoutCache) {
    defaultLayoutCache = await getDefaultCertificateLayout();
  }
  return defaultLayoutCache;
}

const PX_PER_MM = 3.2;
const PAGE_MARGIN_MM = 15;
const LG_BREAKPOINT = 1024;
const LEFT_PANEL_KEY = "sems.cert-settings.leftOpen";
const RIGHT_PANEL_KEY = "sems.cert-settings.rightOpen";

type FieldAlign = NonNullable<CertificateLayoutField["align"]>;
type DummySubject = {
  subject_code: string;
  subject_name: string;
  grade: string;
};

const SUBJECT_COLUMN_PRESETS: Record<1 | 2 | 3, CertificateSubjectColumn[]> = {
  1: ["subject_name"],
  2: ["subject_name", "grade"],
  3: ["subject_code", "subject_name", "grade"],
};

const DEFAULT_HEADER_LABELS: Record<CertificateSubjectColumn, string> = {
  subject_code: "Code",
  subject_name: "Subject",
  grade: "Grade",
};

const SUBJECT_COLUMN_WEIGHTS: Record<CertificateSubjectColumn, number> = {
  subject_code: 1.2,
  subject_name: 4,
  grade: 1,
};

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DUMMY_SUBJECTS: DummySubject[] = [
  { subject_code: "MAT", subject_name: "Mathematics", grade: "A" },
  { subject_code: "ENG", subject_name: "English Language", grade: "B" },
  { subject_code: "TDW", subject_name: "Technical Drawing", grade: "A" },
  { subject_code: "EIW", subject_name: "Electrical Installation Work", grade: "B" },
];

function authToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

function examLabel(exam: Exam): string {
  return `${exam.exam_type} · ${exam.series} · ${exam.year}`;
}

function uniqueFieldKey(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

function fieldFromCatalog(
  item: CertificateFieldCatalogItem,
  existingKeys: Set<string>
): CertificateLayoutField {
  const defaults = { ...item.defaults };
  let key: string;
  if (item.unique) {
    key = item.key;
  } else if (item.type === "image") {
    key = uniqueFieldKey("image", existingKeys);
    defaults.asset_key = key;
    defaults.label = defaults.label || "Image";
  } else {
    key = uniqueFieldKey("static", existingKeys);
    defaults.label = defaults.label || "Custom text";
  }
  return {
    key,
    type: item.type,
    label: (defaults.label as string) || item.label,
    x_mm: Number(defaults.x_mm ?? 40),
    y_mm: Number(defaults.y_mm ?? 80),
    font_size: defaults.font_size != null ? Number(defaults.font_size) : undefined,
    align: (defaults.align as CertificateLayoutField["align"]) || "left",
    max_width_mm: defaults.max_width_mm != null ? Number(defaults.max_width_mm) : undefined,
    line_height_mm: defaults.line_height_mm != null ? Number(defaults.line_height_mm) : undefined,
    columns: defaults.columns as CertificateSubjectColumn[] | undefined,
    show_header: defaults.show_header,
    show_borders: defaults.show_borders,
    header_labels: defaults.header_labels
      ? { ...defaults.header_labels }
      : undefined,
    asset_key: defaults.asset_key as string | undefined,
    width_mm: defaults.width_mm != null ? Number(defaults.width_mm) : undefined,
    height_mm: defaults.height_mm != null ? Number(defaults.height_mm) : undefined,
    static_value: defaults.static_value as string | undefined,
  };
}

function editorSnapshot(input: {
  name: string;
  pageWidthMm: number;
  pageHeightMm: number;
  dateFormat: string;
  layout: CertificateLayoutJson;
}): string {
  return JSON.stringify(input);
}

function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatPythonDate(value: Date, format: string): string {
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const year = String(value.getFullYear());
  const tokens: Record<string, string> = {
    "%d": day,
    "%m": month,
    "%Y": year,
    "%y": year.slice(-2),
    "%B": MONTHS_LONG[value.getMonth()],
    "%b": MONTHS_SHORT[value.getMonth()],
  };
  return format.replace(/%d|%m|%Y|%y|%B|%b/g, (token) => tokens[token] ?? token);
}

function subjectColumns(field: CertificateLayoutField): CertificateSubjectColumn[] {
  const raw = field.columns?.filter(
    (column): column is CertificateSubjectColumn =>
      column === "subject_code" || column === "subject_name" || column === "grade"
  );
  return raw && raw.length > 0 ? raw : SUBJECT_COLUMN_PRESETS[2];
}

function subjectColumnCount(field: CertificateLayoutField): 1 | 2 | 3 {
  const count = subjectColumns(field).length;
  if (count <= 1) return 1;
  if (count >= 3) return 3;
  return 2;
}

function headerLabel(
  column: CertificateSubjectColumn,
  labels: CertificateLayoutField["header_labels"]
): string {
  return labels?.[column] || DEFAULT_HEADER_LABELS[column];
}

function buildDummyContext(
  exam: Exam | null,
  dateFormat: string
): Record<string, string | DummySubject[]> {
  const schoolCode = "0010101";
  const schoolName = "Accra Technical Institute";
  return {
    candidate_name: "Ama Serwaa Mensah",
    index_number: "0012345678",
    school_name: schoolName,
    school_code: schoolCode,
    programme_name: "Electrical Engineering Technology",
    certificate_number: "CERT-2026-000142",
    issuance_date: formatPythonDate(new Date(2026, 6, 15), dateFormat || "%d %B %Y"),
    exam_year: exam ? String(exam.year) : "2026",
    exam_type: exam?.exam_type ?? "Certificate II",
    exam_series: exam?.series ?? "MAY/JUNE",
    exam_description: exam?.description || "Technical Examinations",
    subjects: DUMMY_SUBJECTS,
  };
}

function CatalogRow({
  item,
  added,
  onAdd,
}: {
  item: CertificateFieldCatalogItem;
  added: boolean;
  onAdd: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={added}
          onClick={onAdd}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            added
              ? "cursor-default text-muted-foreground"
              : "hover:bg-muted"
          )}
        >
          {item.type === "image" ? (
            <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Type className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {added ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        {item.description || item.label}
      </TooltipContent>
    </Tooltip>
  );
}

function AlignControl({
  value,
  onChange,
}: {
  value: FieldAlign;
  onChange: (align: FieldAlign) => void;
}) {
  const opts: { id: FieldAlign; icon: typeof AlignLeft; label: string }[] = [
    { id: "left", icon: AlignLeft, label: "Align left" },
    { id: "center", icon: AlignCenter, label: "Align center" },
    { id: "right", icon: AlignRight, label: "Align right" },
    { id: "justify", icon: AlignJustify, label: "Justify" },
  ];
  return (
    <div className="flex rounded-md border p-0.5">
      {opts.map(({ id, icon: Icon, label }) => (
        <Button
          key={id}
          type="button"
          variant={value === id ? "secondary" : "ghost"}
          size="sm"
          className="h-8 flex-1 px-0"
          aria-label={label}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}

function SubjectsTable({
  rows,
  columns,
  showHeader,
  showBorders,
  headerLabels,
  align,
  fontPx,
  rowHeightPx,
  widthPx,
}: {
  rows: DummySubject[];
  columns: CertificateSubjectColumn[];
  showHeader: boolean;
  showBorders: boolean;
  headerLabels?: CertificateLayoutField["header_labels"];
  align: FieldAlign;
  fontPx: number;
  rowHeightPx: number;
  widthPx: number;
}) {
  const totalWeight = columns.reduce((sum, column) => sum + SUBJECT_COLUMN_WEIGHTS[column], 0);
  const textAlign =
    align === "center" ? "center" : align === "right" ? "right" : "left";
  const cellBorder = showBorders ? "border border-foreground/70" : "border border-transparent";
  return (
    <table
      className="border-collapse text-foreground"
      style={{ width: widthPx, fontSize: fontPx }}
    >
      {showHeader && (
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className={cn(cellBorder, "px-1 font-semibold")}
                style={{
                  width: `${(SUBJECT_COLUMN_WEIGHTS[column] / totalWeight) * 100}%`,
                  height: rowHeightPx,
                  textAlign,
                }}
              >
                {headerLabel(column, headerLabels)}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.subject_code}-${row.subject_name}`}>
            {columns.map((column) => (
              <td
                key={column}
                className={cn("truncate px-1", cellBorder)}
                style={{ height: rowHeightPx, textAlign }}
              >
                {row[column]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PanelRail({
  label,
  onExpand,
  children,
}: {
  label: string;
  onExpand: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="hidden w-9 shrink-0 flex-col items-center gap-1 rounded-lg border bg-card py-2 lg:flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={onExpand}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </aside>
  );
}

export default function CertificateSettingsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<CertificateFieldCatalogItem[]>([]);
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("Certificate overlay");
  const [pageWidthMm, setPageWidthMm] = useState(210);
  const [pageHeightMm, setPageHeightMm] = useState(297);
  const [dateFormat, setDateFormat] = useState("%d %B %Y");
  const [layout, setLayout] = useState<CertificateLayoutJson>({ fields: [] });
  const [assets, setAssets] = useState<CertificateTemplateAsset[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [fieldsTab, setFieldsTab] = useState("available");
  const [pxPerMm, setPxPerMm] = useState(PX_PER_MM);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [isLg, setIsLg] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedExam = useMemo(
    () => exams.find((e) => e.id === examId) ?? null,
    [exams, examId]
  );

  const selectedField = useMemo(
    () => layout.fields.find((f) => f.key === selectedFieldKey) ?? null,
    [layout.fields, selectedFieldKey]
  );

  const usedUniqueKeys = useMemo(() => new Set(layout.fields.map((f) => f.key)), [layout.fields]);

  const examOptions = useMemo(
    () => exams.map((exam) => ({ value: exam.id, label: examLabel(exam) })),
    [exams]
  );

  const examDataFields = useMemo(
    () => catalog.filter((c) => c.source === "exam_data"),
    [catalog]
  );
  const staticFields = useMemo(
    () => catalog.filter((c) => c.source === "static"),
    [catalog]
  );

  const currentSnapshot = useMemo(
    () => editorSnapshot({ name, pageWidthMm, pageHeightMm, dateFormat, layout }),
    [name, pageWidthMm, pageHeightMm, dateFormat, layout]
  );
  const isDirty = Boolean(savedSnapshot) && currentSnapshot !== savedSnapshot;
  const showUnsaved = selectedId == null || isDirty;
  const scalePct = Math.round((pxPerMm / PX_PER_MM) * 100);
  const showLeftPanel = !isLg || leftOpen;
  const showRightPanel = !isLg || rightOpen;
  const canvasFocused = isLg && !leftOpen && !rightOpen;
  const dummyContext = useMemo(
    () => buildDummyContext(selectedExam, dateFormat),
    [selectedExam, dateFormat]
  );

  const markSaved = useCallback(
    (next: {
      name: string;
      pageWidthMm: number;
      pageHeightMm: number;
      dateFormat: string;
      layout: CertificateLayoutJson;
    }) => {
      setSavedSnapshot(editorSnapshot(next));
    },
    []
  );

  const setLeftPanel = useCallback((open: boolean) => {
    setLeftOpen(open);
    localStorage.setItem(LEFT_PANEL_KEY, String(open));
  }, []);

  const setRightPanel = useCallback((open: boolean) => {
    setRightOpen(open);
    localStorage.setItem(RIGHT_PANEL_KEY, String(open));
  }, []);

  const toggleFocusCanvas = () => {
    if (leftOpen || rightOpen) {
      setLeftPanel(false);
      setRightPanel(false);
    } else {
      setLeftPanel(true);
      setRightPanel(true);
    }
  };

  const loadAssets = useCallback(async (templateId: number) => {
    try {
      const data = await listCertificateTemplateAssets(templateId);
      setAssets(data.items);
      const token = authToken();
      const urls: Record<string, string> = {};
      await Promise.all(
        data.items.map(async (asset) => {
          const cacheKey = `${templateId}:${asset.key}`;
          const cached = assetUrlCache.get(cacheKey);
          if (cached) {
            urls[asset.key] = cached;
            return;
          }
          const res = await fetch(getCertificateTemplateAssetUrl(templateId, asset.key), {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (res.ok) {
            const blobUrl = URL.createObjectURL(await res.blob());
            assetUrlCache.set(cacheKey, blobUrl);
            urls[asset.key] = blobUrl;
          }
        })
      );
      setAssetUrls(urls);
    } catch {
      setAssets([]);
    }
  }, []);

  const applyTemplate = useCallback(
    async (template: CertificateTemplate | null, defaultLayout: CertificateLayoutJson) => {
      if (!template) {
        const nextName = "Certificate overlay";
        const nextWidth = 210;
        const nextHeight = 297;
        const nextDate = defaultLayout.date_format || "%d %B %Y";
        setSelectedId(null);
        setName(nextName);
        setPageWidthMm(nextWidth);
        setPageHeightMm(nextHeight);
        setLayout(defaultLayout);
        setDateFormat(nextDate);
        setSelectedFieldKey(null);
        setAssets([]);
        setAssetUrls({});
        markSaved({
          name: nextName,
          pageWidthMm: nextWidth,
          pageHeightMm: nextHeight,
          dateFormat: nextDate,
          layout: defaultLayout,
        });
        return;
      }
      const lj = template.layout_json?.fields ? template.layout_json : defaultLayout;
      const nextDate = lj.date_format || "%d %B %Y";
      setSelectedId(template.id);
      setName(template.name);
      setPageWidthMm(template.page_width_mm);
      setPageHeightMm(template.page_height_mm);
      setLayout(lj);
      setDateFormat(nextDate);
      setSelectedFieldKey(lj.fields?.[0]?.key ?? null);
      markSaved({
        name: template.name,
        pageWidthMm: template.page_width_mm,
        pageHeightMm: template.page_height_mm,
        dateFormat: nextDate,
        layout: lj,
      });
      await loadAssets(template.id);
    },
    [loadAssets, markSaved]
  );

  const loadForExam = useCallback(
    async (selectedExamId: number) => {
      setLoading(true);
      try {
        const [list, defaultLayout] = await Promise.all([
          listCertificateTemplates({ examId: selectedExamId, activeOnly: false }),
          cachedDefaultLayout(),
        ]);
        setTemplates(list.items);
        await applyTemplate(list.items[0] ?? null, defaultLayout);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load templates");
      } finally {
        setLoading(false);
      }
    },
    [applyTemplate]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [examList, fieldCatalog] = await Promise.all([
          getAllExams(),
          getCertificateFieldCatalog(),
        ]);
        if (cancelled) return;
        const sorted = [...examList].sort((a, b) => b.year - a.year || a.id - b.id);
        setExams(sorted);
        setCatalog(fieldCatalog.items);
        if (sorted.length > 0) {
          setExamId(sorted[0].id);
        } else {
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load settings");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (examId == null) return;
    loadForExam(examId);
  }, [examId, loadForExam]);

  useEffect(() => {
    const storedLeft = localStorage.getItem(LEFT_PANEL_KEY);
    const storedRight = localStorage.getItem(RIGHT_PANEL_KEY);
    if (storedLeft !== null) setLeftOpen(storedLeft !== "false");
    if (storedRight !== null) setRightOpen(storedRight !== "false");
  }, []);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
    const onChange = () => setIsLg(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const selectTemplate = async (template: CertificateTemplate) => {
    const defaultLayout = await cachedDefaultLayout();
    await applyTemplate(template, defaultLayout);
  };

  const updateField = (key: string, patch: Partial<CertificateLayoutField>) => {
    setLayout((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
    }));
  };

  const applyAlign = (key: string, align: FieldAlign) => {
    setLayout((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => {
        if (f.key !== key) return f;
        const next: CertificateLayoutField = { ...f, align };
        if ((align === "center" || align === "right" || align === "justify") && next.max_width_mm == null) {
          next.max_width_mm = Math.max(10, roundMm(pageWidthMm - f.x_mm));
        }
        return next;
      }),
    }));
  };

  const applySubjectColumnCount = (key: string, count: 1 | 2 | 3) => {
    const field = layout.fields.find((item) => item.key === key);
    const nextColumns = SUBJECT_COLUMN_PRESETS[count];
    const nextLabels: NonNullable<CertificateLayoutField["header_labels"]> = {
      ...(field?.header_labels || {}),
    };
    for (const column of nextColumns) {
      if (!nextLabels[column]) nextLabels[column] = DEFAULT_HEADER_LABELS[column];
    }
    updateField(key, { columns: nextColumns, header_labels: nextLabels });
  };

  const spanFieldAcrossPage = (key: string) => {
    updateField(key, {
      x_mm: PAGE_MARGIN_MM,
      max_width_mm: Math.max(10, roundMm(pageWidthMm - PAGE_MARGIN_MM * 2)),
    });
  };

  const addFromCatalog = (item: CertificateFieldCatalogItem) => {
    if (item.unique && usedUniqueKeys.has(item.key)) {
      toast.message(`${item.label} is already on the layout`);
      return;
    }
    const field = fieldFromCatalog(item, usedUniqueKeys);
    const offset = layout.fields.length * 4;
    field.y_mm = Math.min(pageHeightMm - 20, (field.y_mm || 80) + offset);
    setLayout((prev) => ({ ...prev, fields: [...prev.fields, field] }));
    setSelectedFieldKey(field.key);
    setFieldsTab("layout");
  };

  const removeField = (key: string) => {
    setLayout((prev) => ({ ...prev, fields: prev.fields.filter((f) => f.key !== key) }));
    if (selectedFieldKey === key) setSelectedFieldKey(null);
  };

  const onCanvasMouseDown = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedFieldKey(key);
    setDragging(key);
  };

  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const updateScale = () => {
      const pad = 40;
      const availW = Math.max(120, el.clientWidth - pad);
      const availH = Math.max(120, el.clientHeight - pad);
      const fit = Math.min(availW / pageWidthMm, availH / pageHeightMm);
      setPxPerMm(Math.min(PX_PER_MM, Math.max(1.4, fit)));
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageWidthMm, pageHeightMm, loading, examId, leftOpen, rightOpen, isLg]);

  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x_mm = Math.max(0, Math.min(pageWidthMm, (e.clientX - rect.left) / pxPerMm));
        const y_mm = Math.max(0, Math.min(pageHeightMm, (e.clientY - rect.top) / pxPerMm));
        updateField(dragging, {
          x_mm: roundMm(x_mm),
          y_mm: roundMm(y_mm),
        });
      });
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, pageWidthMm, pageHeightMm, pxPerMm]);

  useEffect(() => {
    if (!isDirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [isDirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedFieldKey || dragging) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const step = e.shiftKey ? 2 : 0.5;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;
      e.preventDefault();
      const field = layout.fields.find((f) => f.key === selectedFieldKey);
      if (!field) return;
      updateField(selectedFieldKey, {
        x_mm: Math.max(0, Math.min(pageWidthMm, roundMm(field.x_mm + dx))),
        y_mm: Math.max(0, Math.min(pageHeightMm, roundMm(field.y_mm + dy))),
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedFieldKey, dragging, layout.fields, pageWidthMm, pageHeightMm]);

  const handleSave = async () => {
    if (examId == null) {
      toast.error("Select an examination first");
      return;
    }
    setSaving(true);
    try {
      const layoutToSave: CertificateLayoutJson = {
        ...layout,
        date_format: dateFormat,
      };
      const payload = {
        name,
        exam_id: examId,
        page_width_mm: pageWidthMm,
        page_height_mm: pageHeightMm,
        layout_json: layoutToSave,
        is_active: true,
      };
      if (selectedId) {
        const updated = await updateCertificateTemplate(selectedId, payload);
        toast.success("Template saved");
        setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setLayout(updated.layout_json);
        markSaved({
          name: updated.name,
          pageWidthMm: updated.page_width_mm,
          pageHeightMm: updated.page_height_mm,
          dateFormat: updated.layout_json.date_format || dateFormat,
          layout: updated.layout_json,
        });
      } else {
        const created = await createCertificateTemplate(payload);
        toast.success("Template created");
        setSelectedId(created.id);
        setTemplates((prev) => [created, ...prev]);
        setLayout(created.layout_json);
        markSaved({
          name: created.name,
          pageWidthMm: created.page_width_mm,
          pageHeightMm: created.page_height_mm,
          dateFormat: created.layout_json.date_format || dateFormat,
          layout: created.layout_json,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleNew = async () => {
    if (examId == null) {
      toast.error("Select an examination first");
      return;
    }
    try {
      const defaultLayout = await cachedDefaultLayout();
      const nextName = selectedExam
        ? `${selectedExam.exam_type} ${selectedExam.year} certificate`
        : "Certificate overlay";
      const nextWidth = 210;
      const nextHeight = 297;
      const nextDate = defaultLayout.date_format || "%d %B %Y";
      setSelectedId(null);
      setName(nextName);
      setPageWidthMm(nextWidth);
      setPageHeightMm(nextHeight);
      setLayout(defaultLayout);
      setDateFormat(nextDate);
      setSelectedFieldKey(null);
      setAssets([]);
      setAssetUrls({});
      setFieldsTab("available");
      markSaved({
        name: nextName,
        pageWidthMm: nextWidth,
        pageHeightMm: nextHeight,
        dateFormat: nextDate,
        layout: defaultLayout,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start new template");
    }
  };

  const handleUploadAsset = async (file: File) => {
    if (!selectedId) {
      toast.error("Save the template first, then upload images");
      return;
    }
    const key =
      (selectedField?.type === "image" && (selectedField.asset_key || selectedField.key)) ||
      "signature";
    setUploading(true);
    try {
      await uploadCertificateTemplateAsset(selectedId, file, key, selectedField?.label);
      toast.success(`Uploaded ${key}`);
      await loadAssets(selectedId);
      if (selectedField?.type === "image") {
        updateField(selectedField.key, { asset_key: key });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAsset = async (key: string) => {
    if (!selectedId) return;
    try {
      await deleteCertificateTemplateAsset(selectedId, key);
      toast.success("Asset removed");
      await loadAssets(selectedId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleTemplateSelect = (value: string) => {
    if (value === "__new__") {
      void handleNew();
      return;
    }
    const template = templates.find((t) => String(t.id) === value);
    if (template) void selectTemplate(template);
  };

  return (
    <DashboardLayout title="Certificates">
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <TopBar title="Certificate settings" showSearch={false} />

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
          <CertificateBreadcrumbs
            items={[
              { label: "Certificates", href: "/results/certificates" },
              { label: "Settings" },
            ]}
          />
          {/* Toolbar */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-2" asChild>
              <Link href="/results/certificates">
                <ArrowLeft className="h-4 w-4" />
                Certificates
              </Link>
            </Button>

            <Separator orientation="vertical" className="hidden h-6 sm:block" />

            <SearchableSelect
              className="min-w-[220px] flex-1 basis-[220px] sm:max-w-sm"
              triggerClassName="h-9"
              options={examOptions}
              value={examId ?? ""}
              onValueChange={(value) => {
                if (value === "" || value === "all") return;
                setExamId(typeof value === "number" ? value : Number(value));
              }}
              placeholder="Examination"
              searchPlaceholder="Search examinations…"
              emptyMessage="No examinations found"
              disabled={loading && exams.length === 0}
            />

            <Select
              value={selectedId != null ? String(selectedId) : "__new__"}
              onValueChange={handleTemplateSelect}
              disabled={examId == null || loading}
            >
              <SelectTrigger className="h-9 w-full min-w-[160px] sm:w-56">
                <SelectValue placeholder="Template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                    {!t.is_active ? " (inactive)" : ""}
                  </SelectItem>
                ))}
                <SelectItem value="__new__">
                  {templates.length === 0 ? "Untitled template" : "New unsaved template"}
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={handleNew}
                disabled={examId == null || loading}
              >
                <Plus className="mr-1 h-4 w-4" />
                New
              </Button>
              <Button
                size="sm"
                className="h-9"
                onClick={handleSave}
                disabled={saving || loading || examId == null}
              >
                {saving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1 h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : examId == null ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              No examinations found. Create an exam first.
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
              {/* Fields panel */}
              {!showLeftPanel ? (
                <PanelRail label="Show fields" onExpand={() => setLeftPanel(true)}>
                  {fieldsTab === "layout" ? <List className="h-4 w-4" /> : <Type className="h-4 w-4" />}
                </PanelRail>
              ) : (
                <aside className="flex max-h-56 min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border bg-card lg:max-h-none lg:w-[240px]">
                  <div className="flex shrink-0 items-center justify-between border-b px-2 py-1.5">
                    <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Fields
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="hidden lg:inline-flex"
                      aria-label="Collapse fields"
                      onClick={() => setLeftPanel(false)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                  <Tabs
                    value={fieldsTab}
                    onValueChange={setFieldsTab}
                    className="flex min-h-0 flex-1 flex-col"
                  >
                    <div className="shrink-0 border-b px-3 pt-2 pb-2">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="available">Add fields</TabsTrigger>
                        <TabsTrigger value="layout">
                          On layout
                          {layout.fields.length > 0 && (
                            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                              {layout.fields.length}
                            </Badge>
                          )}
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent
                      value="available"
                      className="mt-0 min-h-0 flex-1 overflow-y-auto p-2 data-[state=inactive]:hidden"
                    >
                      <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        From examination
                      </div>
                      <div className="mb-3 space-y-0.5">
                        {examDataFields.map((item) => (
                          <CatalogRow
                            key={item.key}
                            item={item}
                            added={item.unique && usedUniqueKeys.has(item.key)}
                            onAdd={() => addFromCatalog(item)}
                          />
                        ))}
                      </div>
                      <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Static
                      </div>
                      <div className="space-y-0.5">
                        {staticFields.map((item) => (
                          <CatalogRow
                            key={item.key}
                            item={item}
                            added={false}
                            onAdd={() => addFromCatalog(item)}
                          />
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent
                      value="layout"
                      className="mt-0 min-h-0 flex-1 overflow-y-auto p-2 data-[state=inactive]:hidden"
                    >
                      {layout.fields.length === 0 ? (
                        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                          No fields yet. Switch to Add fields.
                        </p>
                      ) : (
                        <ul className="space-y-0.5">
                          {layout.fields.map((field) => (
                            <li key={field.key}>
                              <div
                                className={cn(
                                  "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                                  selectedFieldKey === field.key
                                    ? "bg-primary/10 text-foreground"
                                    : "hover:bg-muted"
                                )}
                              >
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 truncate text-left"
                                  onClick={() => setSelectedFieldKey(field.key)}
                                >
                                  {field.label || field.key}
                                </button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 shrink-0 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                                  onClick={() => removeField(field.key)}
                                  aria-label={`Remove ${field.label || field.key}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TabsContent>
                  </Tabs>
                </aside>
              )}

              {/* Canvas */}
              <section className="flex min-h-[240px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-muted/40">
                <div className="flex shrink-0 flex-col gap-2 border-b bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium">{name || "Untitled"}</div>
                        {showUnsaved && (
                          <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
                            Unsaved
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {pageWidthMm} × {pageHeightMm} mm
                        {layout.fields.length > 0 ? ` · ${layout.fields.length} fields` : ""}
                        {` · ${scalePct}% · Fit`}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {layout.fields.length > 0 && (
                        <label className="mr-1 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                          <Eye className="h-3.5 w-3.5" />
                          Preview
                          <Switch
                            checked={previewMode}
                            onCheckedChange={setPreviewMode}
                            aria-label="Preview template with dummy data"
                          />
                        </label>
                      )}
                      {layout.fields.length > 0 && !previewMode && (
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          Drag or arrow keys
                        </span>
                      )}
                      <Button
                        type="button"
                        variant={canvasFocused ? "secondary" : "ghost"}
                        size="sm"
                        className="hidden h-8 lg:inline-flex"
                        onClick={toggleFocusCanvas}
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                        {canvasFocused ? "Show panels" : "Focus canvas"}
                      </Button>
                    </div>
                  </div>
                  {layout.fields.length === 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {examDataFields.slice(0, 4).map((item) => (
                        <Button
                          key={item.key}
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => addFromCatalog(item)}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          {item.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  ref={workspaceRef}
                  className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3"
                >
                  <div
                    ref={canvasRef}
                    className="relative bg-white shadow-sm ring-1 ring-border"
                    style={{
                      width: pageWidthMm * pxPerMm,
                      height: pageHeightMm * pxPerMm,
                      backgroundImage: previewMode
                        ? undefined
                        : "linear-gradient(to right, rgba(0,0,0,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.035) 1px, transparent 1px)",
                      backgroundSize: `${10 * pxPerMm}px ${10 * pxPerMm}px`,
                    }}
                  >
                    {layout.fields.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                        <p className="max-w-[14rem] text-sm text-muted-foreground">
                          Overlay preview — add fields from the left, then drag to place
                        </p>
                      </div>
                    )}
                    {layout.fields.map((field) => {
                      const isImage = field.type === "image";
                      const isSubjects = field.key === "subjects" || field.type === "subjects";
                      const assetKey = field.asset_key || field.key;
                      const imgUrl = isImage ? assetUrls[assetKey] : undefined;
                      const selected = selectedFieldKey === field.key;
                      const fontPx = Math.max(9, (field.font_size || 11) * (pxPerMm / PX_PER_MM));
                      const align = field.align || "left";
                      const alignClass =
                        align === "center"
                          ? "items-center text-center"
                          : align === "right"
                            ? "items-end text-right"
                            : align === "justify"
                              ? "items-stretch text-justify [text-align-last:left]"
                              : "items-start text-left";
                      const wrapClass = align === "justify" ? "whitespace-normal break-words" : "truncate";
                      const dummyValue = dummyContext[field.key];
                      const previewText =
                        field.static_value !== undefined
                          ? field.static_value
                          : typeof dummyValue === "string"
                            ? dummyValue
                            : `{${field.key}}`;
                      const subjectCols = isSubjects ? subjectColumns(field) : [];
                      const subjectRows = isSubjects
                        ? previewMode
                          ? DUMMY_SUBJECTS
                          : DUMMY_SUBJECTS.slice(0, 2)
                        : [];
                      const lineHeightPx = (field.line_height_mm || 7) * pxPerMm;
                      const tableWidthMm = field.max_width_mm || 130;
                      return (
                        <div
                          key={field.key}
                          onMouseDown={(e) => onCanvasMouseDown(field.key, e)}
                          className={cn(
                            "absolute cursor-move select-none rounded-sm border",
                            previewMode ? "overflow-visible" : "overflow-hidden",
                            previewMode && !selected
                              ? "border-transparent bg-transparent"
                              : selected
                                ? "border-primary bg-primary/10 ring-1 ring-primary"
                                : "border-dashed border-foreground/25 bg-background/85 hover:border-foreground/40"
                          )}
                          style={{
                            left: field.x_mm * pxPerMm,
                            top: field.y_mm * pxPerMm,
                            fontSize: fontPx,
                            width: isImage
                              ? (field.width_mm || 40) * pxPerMm
                              : isSubjects
                                ? tableWidthMm * pxPerMm
                                : field.max_width_mm
                                  ? field.max_width_mm * pxPerMm
                                  : undefined,
                            height: isImage ? (field.height_mm || 15) * pxPerMm : undefined,
                          }}
                        >
                          {isImage ? (
                            imgUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={imgUrl}
                                alt={field.label || field.key}
                                className="h-full w-full object-contain"
                              />
                            ) : previewMode ? (
                              <div className="flex h-full w-full items-center justify-center border border-dashed border-foreground/20 text-[0.7em] text-muted-foreground">
                                Image
                              </div>
                            ) : (
                              <div className={cn("flex w-full flex-col", alignClass)}>
                                <div className="w-full truncate px-1 pt-0.5 text-[0.65em] font-medium uppercase tracking-wide text-muted-foreground">
                                  {field.label || field.key}
                                </div>
                                <div className={cn("w-full px-1 pb-0.5 text-foreground", wrapClass)}>
                                  {`{${field.key}}`}
                                </div>
                              </div>
                            )
                          ) : (
                            <div className={cn("flex w-full flex-col", alignClass)}>
                              {!previewMode && (
                                <div className="w-full truncate px-1 pt-0.5 text-[0.65em] font-medium uppercase tracking-wide text-muted-foreground">
                                  {field.label || field.key}
                                </div>
                              )}
                              {isSubjects ? (
                                <div className={cn("w-full", previewMode ? "px-0" : "px-1 pb-0.5")}>
                                  <SubjectsTable
                                    rows={subjectRows}
                                    columns={subjectCols}
                                    showHeader={field.show_header !== false}
                                    showBorders={field.show_borders !== false}
                                    headerLabels={field.header_labels}
                                    align={align}
                                    fontPx={fontPx}
                                    rowHeightPx={lineHeightPx}
                                    widthPx={tableWidthMm * pxPerMm - (previewMode ? 0 : 8)}
                                  />
                                </div>
                              ) : (
                                <div
                                  className={cn(
                                    "w-full text-foreground",
                                    wrapClass,
                                    previewMode ? "px-0" : "px-1 pb-0.5"
                                  )}
                                >
                                  {previewMode ? previewText : field.static_value || `{${field.key}}`}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Inspector */}
              {!showRightPanel ? (
                <PanelRail label="Show inspector" onExpand={() => setRightPanel(true)}>
                  <Settings2 className="h-4 w-4" />
                </PanelRail>
              ) : (
                <aside className="flex max-h-72 min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border bg-card lg:max-h-none lg:w-[280px]">
                  <div className="flex shrink-0 items-center justify-between border-b px-2 py-1.5">
                    <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Inspector
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="hidden lg:inline-flex"
                      aria-label="Collapse inspector"
                      onClick={() => setRightPanel(false)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
                    <div className="space-y-3">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Selected field
                      </div>
                      {!selectedField ? (
                        <p className="text-sm text-muted-foreground">
                          Select a field on the canvas or in On layout.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {selectedField.key}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px]">
                              {selectedField.type || "text"}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto h-8 w-8 p-0 text-destructive"
                              onClick={() => removeField(selectedField.key)}
                              aria-label="Remove field"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Label</Label>
                            <Input
                              className="h-9"
                              value={selectedField.label || ""}
                              onChange={(e) =>
                                updateField(selectedField.key, { label: e.target.value })
                              }
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs">X (mm)</Label>
                              <Input
                                className="h-9"
                                type="number"
                                step="0.1"
                                value={selectedField.x_mm}
                                onChange={(e) =>
                                  updateField(selectedField.key, {
                                    x_mm: Number(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Y (mm)</Label>
                              <Input
                                className="h-9"
                                type="number"
                                step="0.1"
                                value={selectedField.y_mm}
                                onChange={(e) =>
                                  updateField(selectedField.key, {
                                    y_mm: Number(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                          </div>
                          {selectedField.type !== "image" && (
                            <>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Alignment</Label>
                                <AlignControl
                                  value={selectedField.align || "left"}
                                  onChange={(align) => applyAlign(selectedField.key, align)}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 w-full text-xs"
                                onClick={() => spanFieldAcrossPage(selectedField.key)}
                              >
                                Span page
                              </Button>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Font size</Label>
                                  <Input
                                    className="h-9"
                                    type="number"
                                    value={selectedField.font_size ?? 11}
                                    onChange={(e) =>
                                      updateField(selectedField.key, {
                                        font_size: Number(e.target.value) || 10,
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Max width (mm)</Label>
                                  <Input
                                    className="h-9"
                                    type="number"
                                    step="0.1"
                                    value={selectedField.max_width_mm ?? ""}
                                    placeholder="Auto"
                                    onChange={(e) =>
                                      updateField(selectedField.key, {
                                        max_width_mm: e.target.value
                                          ? Number(e.target.value) || undefined
                                          : undefined,
                                      })
                                    }
                                  />
                                </div>
                              </div>
                              {selectedField.type === "subjects" && (
                                <div className="space-y-3">
                                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Table
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1.5">
                                      <Label className="text-xs">Columns</Label>
                                      <Select
                                        value={String(subjectColumnCount(selectedField))}
                                        onValueChange={(value) =>
                                          applySubjectColumnCount(
                                            selectedField.key,
                                            Number(value) as 1 | 2 | 3
                                          )
                                        }
                                      >
                                        <SelectTrigger className="h-9">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="1">1 — Subject</SelectItem>
                                          <SelectItem value="2">2 — Subject, Grade</SelectItem>
                                          <SelectItem value="3">3 — Code, Subject, Grade</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-xs">Row height (mm)</Label>
                                      <Input
                                        className="h-9"
                                        type="number"
                                        step="0.1"
                                        value={selectedField.line_height_mm ?? 7}
                                        onChange={(e) =>
                                          updateField(selectedField.key, {
                                            line_height_mm: Number(e.target.value) || 7,
                                          })
                                        }
                                      />
                                    </div>
                                  </div>
                                  <label className="flex items-center justify-between gap-2 text-xs">
                                    <span>Show header</span>
                                    <Switch
                                      checked={selectedField.show_header !== false}
                                      onCheckedChange={(checked) =>
                                        updateField(selectedField.key, {
                                          show_header: checked,
                                        })
                                      }
                                      aria-label="Show table header"
                                    />
                                  </label>
                                  <label className="flex items-center justify-between gap-2 text-xs">
                                    <span>Show borders</span>
                                    <Switch
                                      checked={selectedField.show_borders !== false}
                                      onCheckedChange={(checked) =>
                                        updateField(selectedField.key, {
                                          show_borders: checked,
                                        })
                                      }
                                      aria-label="Show table borders"
                                    />
                                  </label>
                                  {selectedField.show_header !== false && (
                                    <div className="space-y-2">
                                      {subjectColumns(selectedField).map((column) => (
                                        <div key={column} className="space-y-1.5">
                                          <Label className="text-xs">
                                            {DEFAULT_HEADER_LABELS[column]} header
                                          </Label>
                                          <Input
                                            className="h-9"
                                            value={headerLabel(
                                              column,
                                              selectedField.header_labels
                                            )}
                                            onChange={(e) =>
                                              updateField(selectedField.key, {
                                                header_labels: {
                                                  ...selectedField.header_labels,
                                                  [column]: e.target.value,
                                                },
                                              })
                                            }
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                          {selectedField.type === "image" && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Width (mm)</Label>
                                  <Input
                                    className="h-9"
                                    type="number"
                                    value={selectedField.width_mm ?? 40}
                                    onChange={(e) =>
                                      updateField(selectedField.key, {
                                        width_mm: Number(e.target.value) || 40,
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Height (mm)</Label>
                                  <Input
                                    className="h-9"
                                    type="number"
                                    value={selectedField.height_mm ?? 15}
                                    onChange={(e) =>
                                      updateField(selectedField.key, {
                                        height_mm: Number(e.target.value) || 15,
                                      })
                                    }
                                  />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Asset key</Label>
                                <Input
                                  className="h-9 font-mono text-xs"
                                  value={selectedField.asset_key || selectedField.key}
                                  onChange={(e) =>
                                    updateField(selectedField.key, { asset_key: e.target.value })
                                  }
                                />
                              </div>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadAsset(f);
                                }}
                              />
                              <Button
                                variant="secondary"
                                size="sm"
                                className="w-full"
                                disabled={uploading || !selectedId}
                                onClick={() => fileInputRef.current?.click()}
                              >
                                {uploading ? (
                                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                ) : (
                                  <ImagePlus className="mr-1 h-4 w-4" />
                                )}
                                {selectedId ? "Upload image" : "Save template to upload"}
                              </Button>
                            </>
                          )}
                          {selectedField.type === "text" &&
                            selectedField.static_value !== undefined && (
                              <div className="space-y-1.5">
                                <Label className="text-xs">Static text</Label>
                                <Input
                                  className="h-9"
                                  value={selectedField.static_value}
                                  onChange={(e) =>
                                    updateField(selectedField.key, {
                                      static_value: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            )}
                          {selectedField.key === "issuance_date" && (
                            <p className="text-xs text-muted-foreground">
                              Uses the completion date at generate time, not the printed date.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <Separator />

                    <Collapsible defaultOpen={false} className="space-y-3">
                      <CollapsibleTrigger className="flex w-full items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-180">
                        Template
                        <ChevronDown className="h-3.5 w-3.5 transition-transform" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="template-name" className="text-xs">
                            Name
                          </Label>
                          <Input
                            id="template-name"
                            className="h-9"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="page-w" className="text-xs">
                              Width (mm)
                            </Label>
                            <Input
                              id="page-w"
                              className="h-9"
                              type="number"
                              value={pageWidthMm}
                              onChange={(e) => setPageWidthMm(Number(e.target.value) || 210)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="page-h" className="text-xs">
                              Height (mm)
                            </Label>
                            <Input
                              id="page-h"
                              className="h-9"
                              type="number"
                              value={pageHeightMm}
                              onChange={(e) => setPageHeightMm(Number(e.target.value) || 297)}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="date-fmt" className="text-xs">
                            Completion date format
                          </Label>
                          <Input
                            id="date-fmt"
                            className="h-9 font-mono text-xs"
                            value={dateFormat}
                            onChange={(e) => setDateFormat(e.target.value)}
                            placeholder="%d %B %Y"
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {selectedId && assets.length > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Assets
                          </div>
                          <ul className="space-y-1">
                            {assets.map((a) => (
                              <li
                                key={a.id}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                              >
                                <span className="font-mono text-xs">{a.key}</span>
                                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                  {a.file_name}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDeleteAsset(a.key)}
                                  aria-label={`Delete ${a.key}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </div>
                </aside>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
