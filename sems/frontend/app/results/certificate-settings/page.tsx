"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  API_BASE_URL,
  createCertificateTemplate,
  deleteCertificateTemplateAsset,
  getAllExams,
  getCertificateFieldCatalog,
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
  CertificateTemplate,
  CertificateTemplateAsset,
  Exam,
} from "@/types/document";
import {
  ArrowLeft,
  Check,
  ImageIcon,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";

const PX_PER_MM = 3.2;

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
    columns: defaults.columns as string[] | undefined,
    asset_key: defaults.asset_key as string | undefined,
    width_mm: defaults.width_mm != null ? Number(defaults.width_mm) : undefined,
    height_mm: defaults.height_mm != null ? Number(defaults.height_mm) : undefined,
    static_value: defaults.static_value as string | undefined,
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

  const loadAssets = useCallback(async (templateId: number) => {
    try {
      const data = await listCertificateTemplateAssets(templateId);
      setAssets(data.items);
      const urls: Record<string, string> = {};
      const token = authToken();
      await Promise.all(
        data.items.map(async (asset) => {
          const res = await fetch(
            `${API_BASE_URL}/api/v1/certificates/templates/${templateId}/assets/${encodeURIComponent(asset.key)}/file`,
            { headers: token ? { Authorization: `Bearer ${token}` } : {} }
          );
          if (res.ok) {
            const blob = await res.blob();
            urls[asset.key] = URL.createObjectURL(blob);
          }
        })
      );
      setAssetUrls((prev) => {
        Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
        return urls;
      });
    } catch {
      setAssets([]);
    }
  }, []);

  const applyTemplate = useCallback(
    async (template: CertificateTemplate | null, defaultLayout: CertificateLayoutJson) => {
      if (!template) {
        setSelectedId(null);
        setName("Certificate overlay");
        setPageWidthMm(210);
        setPageHeightMm(297);
        setLayout(defaultLayout);
        setDateFormat(defaultLayout.date_format || "%d %B %Y");
        setSelectedFieldKey(null);
        setAssets([]);
        setAssetUrls((prev) => {
          Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
          return {};
        });
        return;
      }
      setSelectedId(template.id);
      setName(template.name);
      setPageWidthMm(template.page_width_mm);
      setPageHeightMm(template.page_height_mm);
      const lj = template.layout_json?.fields ? template.layout_json : defaultLayout;
      setLayout(lj);
      setDateFormat(lj.date_format || "%d %B %Y");
      setSelectedFieldKey(lj.fields?.[0]?.key ?? null);
      await loadAssets(template.id);
    },
    [loadAssets]
  );

  const loadForExam = useCallback(
    async (selectedExamId: number) => {
      setLoading(true);
      try {
        const [list, defaultLayout] = await Promise.all([
          listCertificateTemplates({ examId: selectedExamId, activeOnly: false }),
          getDefaultCertificateLayout(),
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
      Object.values(assetUrls).forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (examId == null) return;
    loadForExam(examId);
  }, [examId, loadForExam]);

  const selectTemplate = async (template: CertificateTemplate) => {
    const defaultLayout = await getDefaultCertificateLayout();
    await applyTemplate(template, defaultLayout);
  };

  const updateField = (key: string, patch: Partial<CertificateLayoutField>) => {
    setLayout((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
    }));
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
  }, [pageWidthMm, pageHeightMm, loading, examId]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x_mm = Math.max(0, Math.min(pageWidthMm, (e.clientX - rect.left) / pxPerMm));
      const y_mm = Math.max(0, Math.min(pageHeightMm, (e.clientY - rect.top) / pxPerMm));
      updateField(dragging, {
        x_mm: Math.round(x_mm * 10) / 10,
        y_mm: Math.round(y_mm * 10) / 10,
      });
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, pageWidthMm, pageHeightMm, pxPerMm]);

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
      } else {
        const created = await createCertificateTemplate(payload);
        toast.success("Template created");
        setSelectedId(created.id);
        setTemplates((prev) => [created, ...prev]);
        setLayout(created.layout_json);
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
      const defaultLayout = await getDefaultCertificateLayout();
      setSelectedId(null);
      setName(
        selectedExam
          ? `${selectedExam.exam_type} ${selectedExam.year} certificate`
          : "Certificate overlay"
      );
      setPageWidthMm(210);
      setPageHeightMm(297);
      setLayout(defaultLayout);
      setDateFormat(defaultLayout.date_format || "%d %B %Y");
      setSelectedFieldKey(null);
      setAssets([]);
      setAssetUrls((prev) => {
        Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
        return {};
      });
      setFieldsTab("available");
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
          {/* Toolbar */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-2" asChild>
              <Link href="/results">
                <ArrowLeft className="h-4 w-4" />
                Results
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
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
              {/* Fields panel */}
              <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
                <Tabs
                  value={fieldsTab}
                  onValueChange={setFieldsTab}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <div className="shrink-0 border-b px-3 pt-3">
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

              {/* Canvas */}
              <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-muted/40">
                <div className="flex shrink-0 flex-col gap-2 border-b bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{name || "Untitled"}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {pageWidthMm} × {pageHeightMm} mm
                        {selectedId == null ? " · unsaved" : ""}
                        {layout.fields.length > 0 ? ` · ${layout.fields.length} fields` : ""}
                      </div>
                    </div>
                    {layout.fields.length > 0 && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Drag to position
                      </span>
                    )}
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
                      backgroundImage:
                        "linear-gradient(to right, rgba(0,0,0,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.035) 1px, transparent 1px)",
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
                      const assetKey = field.asset_key || field.key;
                      const imgUrl = isImage ? assetUrls[assetKey] : undefined;
                      const selected = selectedFieldKey === field.key;
                      const fontPx = Math.max(9, (field.font_size || 11) * (pxPerMm / PX_PER_MM));
                      return (
                        <div
                          key={field.key}
                          onMouseDown={(e) => onCanvasMouseDown(field.key, e)}
                          className={cn(
                            "absolute cursor-move select-none overflow-hidden rounded-sm border",
                            selected
                              ? "border-primary bg-primary/10 ring-1 ring-primary"
                              : "border-dashed border-foreground/25 bg-background/85 hover:border-foreground/40"
                          )}
                          style={{
                            left: field.x_mm * pxPerMm,
                            top: field.y_mm * pxPerMm,
                            fontSize: fontPx,
                            width: isImage
                              ? (field.width_mm || 40) * pxPerMm
                              : field.max_width_mm
                                ? field.max_width_mm * pxPerMm
                                : undefined,
                            height: isImage ? (field.height_mm || 15) * pxPerMm : undefined,
                          }}
                        >
                          {isImage && imgUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imgUrl}
                              alt={field.label || field.key}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <>
                              <div className="truncate px-1 pt-0.5 text-[0.65em] font-medium uppercase tracking-wide text-muted-foreground">
                                {field.label || field.key}
                              </div>
                              <div className="truncate px-1 pb-0.5 text-foreground">
                                {field.key === "subjects" || field.type === "subjects"
                                  ? "Subject — Grade"
                                  : field.static_value || `{${field.key}}`}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Inspector */}
              <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
                  <div className="space-y-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Template
                    </div>
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
                  </div>

                  <Separator />

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
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
