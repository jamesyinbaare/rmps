"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Color from "@tiptap/extension-color";
import TextStyle from "@tiptap/extension-text-style";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { Extension } from "@tiptap/core";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Table as TableIcon,
  Palette,
  Undo,
  Redo,
  Plus,
  Minus,
  Trash2,
  Columns,
  Rows,
  ChevronDown,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Custom LineHeight extension
const LineHeight = Extension.create({
  name: "lineHeight",
  addOptions() {
    return {
      types: ["paragraph", "heading"],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) {
                return {};
              }
              return {
                style: `line-height: ${attributes.lineHeight}`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLineHeight: (lineHeight: string) => ({ commands }: any) => {
        return this.options.types.every((type: string) =>
          commands.updateAttributes(type, { lineHeight })
        );
      },
      unsetLineHeight: () => ({ commands }: any) => {
        return this.options.types.every((type: string) =>
          commands.resetAttributes(type, ["lineHeight"])
        );
      },
    } as any;
  },
});

interface RichTextEditorProps {
  content?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function RichTextEditor({
  content = "",
  onChange,
  placeholder = "Start typing...",
  className,
  disabled = false,
}: RichTextEditorProps) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer",
        },
      }),
      Color,
      TextStyle,
      LineHeight.configure({
        types: ["paragraph", "heading"],
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "border-collapse",
        },
      }),
      TableRow.configure({
        HTMLAttributes: {
          class: "border-row",
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: "border-header",
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: "border-cell",
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm sm:prose-base lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[200px] max-w-none",
          "prose-headings:font-semibold prose-p:my-2 prose-ul:my-2 prose-ol:my-2",
          "prose-li:my-1 prose-table:my-4 prose-table:border-collapse",
          "prose-th:border prose-th:border-border prose-th:p-2 prose-th:bg-muted",
          "prose-td:border prose-td:border-border prose-td:p-2",
          "prose-a:text-primary prose-strong:font-semibold"
        ),
        "data-placeholder": placeholder,
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);

    if (url === null) {
      return;
    }

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const isTableActive = editor.isActive("table");

  const setColor = (color: string) => {
    editor.chain().focus().setColor(color).run();
    setColorPickerOpen(false);
  };

  return (
    <div className={cn("border rounded-lg overflow-hidden relative bg-background", className)}>
      <div className="border-b bg-muted/30 p-1.5 flex flex-wrap gap-0.5 items-center">
        {/* Text formatting */}
        <Button
          type="button"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={disabled || !editor.can().chain().focus().toggleBold().run()}
          className="h-7 w-7"
          title="Bold (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={disabled || !editor.can().chain().focus().toggleItalic().run()}
          className="h-7 w-7"
          title="Italic (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("underline") ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={disabled || !editor.can().chain().focus().toggleUnderline().run()}
          className="h-7 w-7"
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Headings */}
        <Button
          type="button"
          variant={editor.isActive("heading", { level: 1 }) ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          disabled={disabled}
          className="h-7 w-7"
          title="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={disabled}
          className="h-7 w-7"
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("heading", { level: 3 }) ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          disabled={disabled}
          className="h-7 w-7"
          title="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </Button>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Lists */}
        <Button
          type="button"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
          className="h-7 w-7"
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
          className="h-7 w-7"
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Alignment */}
        <Button
          type="button"
          variant={editor.isActive({ textAlign: "left" }) ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          disabled={disabled}
          className="h-7 w-7"
          title="Align Left"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive({ textAlign: "center" }) ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          disabled={disabled}
          className="h-7 w-7"
          title="Align Center"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive({ textAlign: "right" }) ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          disabled={disabled}
          className="h-7 w-7"
          title="Align Right"
        >
          <AlignRight className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive({ textAlign: "justify" }) ? "secondary" : "ghost"}
          size="icon"
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          disabled={disabled}
          className="h-7 w-7"
          title="Justify"
        >
          <AlignJustify className="h-4 w-4" />
        </Button>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Color picker */}
        <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Text Color"
              disabled={disabled}
            >
              <Palette className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3">
            <div className="grid grid-cols-6 gap-2">
              {[
                "#000000",
                "#374151",
                "#6B7280",
                "#EF4444",
                "#F59E0B",
                "#10B981",
                "#3B82F6",
                "#8B5CF6",
                "#EC4899",
              ].map((color) => (
                <button
                  key={color}
                  type="button"
                  className="w-8 h-8 rounded border border-border hover:scale-110 transition-transform cursor-pointer"
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    setColor(color);
                  }}
                  title={color}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Line Height */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Line Height"
              disabled={disabled}
            >
              <Type className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {[
              { label: "Default", value: null },
              { label: "1.0", value: "1.0" },
              { label: "1.2", value: "1.2" },
              { label: "1.5", value: "1.5" },
              { label: "1.8", value: "1.8" },
              { label: "2.0", value: "2.0" },
              { label: "2.5", value: "2.5" },
              { label: "3.0", value: "3.0" },
            ].map((option) => {
              const currentLineHeight = editor.getAttributes("paragraph").lineHeight;
              const isActive = option.value === null
                ? currentLineHeight === null || currentLineHeight === undefined
                : currentLineHeight === option.value;

              return (
                <DropdownMenuItem
                  key={option.value || "default"}
                  onClick={() => {
                    if (option.value === null) {
                      (editor.chain().focus() as any).unsetLineHeight().run();
                    } else {
                      (editor.chain().focus() as any).setLineHeight(option.value).run();
                    }
                  }}
                  className={isActive ? "bg-accent" : ""}
                >
                  {option.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Link */}
        <Button
          type="button"
          variant={editor.isActive("link") ? "secondary" : "ghost"}
          size="icon"
          onClick={setLink}
          disabled={disabled}
          className="h-7 w-7"
          title="Add Link"
        >
          <LinkIcon className="h-4 w-4" />
        </Button>

        {/* Table */}
        {isTableActive ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-7 w-7"
                title="Table Options"
                disabled={disabled}
              >
                <TableIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => editor.chain().focus().addColumnBefore().run()}
                disabled={!editor.can().addColumnBefore()}
              >
                <Columns className="h-4 w-4" />
                Add Column Before
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                disabled={!editor.can().addColumnAfter()}
              >
                <Columns className="h-4 w-4" />
                Add Column After
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().deleteColumn().run()}
                disabled={!editor.can().deleteColumn()}
              >
                <Minus className="h-4 w-4" />
                Delete Column
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => editor.chain().focus().addRowBefore().run()}
                disabled={!editor.can().addRowBefore()}
              >
                <Rows className="h-4 w-4" />
                Add Row Above
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().addRowAfter().run()}
                disabled={!editor.can().addRowAfter()}
              >
                <Rows className="h-4 w-4" />
                Add Row Below
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().deleteRow().run()}
                disabled={!editor.can().deleteRow()}
              >
                <Minus className="h-4 w-4" />
                Delete Row
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => editor.chain().focus().deleteTable().run()}
                disabled={!editor.can().deleteTable()}
              >
                <Trash2 className="h-4 w-4" />
                Delete Table
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={addTable}
            disabled={disabled || !editor.can().insertTable()}
            className="h-7 w-7"
            title="Insert Table"
          >
            <TableIcon className="h-4 w-4" />
          </Button>
        )}

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Undo/Redo */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={disabled || !editor.can().undo()}
          className="h-7 w-7"
          title="Undo (Ctrl+Z)"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={disabled || !editor.can().redo()}
          className="h-7 w-7"
          title="Redo (Ctrl+Y)"
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>
      <div className="relative bg-background">
        <div className="p-3 min-h-[200px] max-h-[500px] overflow-y-auto">
          <div className="relative">
            <EditorContent editor={editor} />
            {editor.isEmpty && (
              <div
                className="absolute inset-0 top-4 left-4 text-muted-foreground pointer-events-none select-none whitespace-pre-wrap"
                aria-hidden="true"
              >
                {placeholder}
              </div>
            )}
          </div>
        </div>
        <style dangerouslySetInnerHTML={{
          __html: `
            .ProseMirror {
              outline: none;
            }
            .ProseMirror p {
              margin: 0.5rem 0;
            }
            .ProseMirror p:first-child {
              margin-top: 0;
            }
            .ProseMirror p:last-child {
              margin-bottom: 0;
            }
            .ProseMirror h1,
            .ProseMirror h2,
            .ProseMirror h3 {
              font-weight: 600;
              margin: 1rem 0 0.5rem 0;
            }
            .ProseMirror h1 {
              font-size: 1.5rem;
            }
            .ProseMirror h2 {
              font-size: 1.25rem;
            }
            .ProseMirror h3 {
              font-size: 1.125rem;
            }
            .ProseMirror ul,
            .ProseMirror ol {
              margin: 0.5rem 0;
              padding-left: 1.5rem;
            }
            .ProseMirror ul {
              list-style-type: disc;
            }
            .ProseMirror ol {
              list-style-type: decimal;
            }
            .ProseMirror li {
              margin: 0.25rem 0;
            }
            .ProseMirror ul li::marker {
              color: currentColor;
            }
            .ProseMirror ol li::marker {
              color: currentColor;
            }
            .ProseMirror a {
              color: hsl(var(--primary));
              text-decoration: underline;
              cursor: pointer;
            }
            .ProseMirror strong {
              font-weight: 600;
            }
            .ProseMirror em {
              font-style: italic;
            }
            .ProseMirror u {
              text-decoration: underline;
            }
            .ProseMirror table {
              border-collapse: collapse;
              table-layout: fixed;
              width: 100%;
              margin: 1rem 0;
              overflow: hidden;
              border: 1px solid #e5e7eb;
            }
            .ProseMirror table td,
            .ProseMirror table th {
              min-width: 1em;
              border: 1px solid #e5e7eb;
              padding: 6px 8px;
              vertical-align: top;
              box-sizing: border-box;
              position: relative;
            }
            .ProseMirror table th {
              font-weight: bold;
              text-align: left;
              background-color: #f3f4f6;
            }
            .ProseMirror table .selectedCell:after {
              z-index: 2;
              position: absolute;
              content: "";
              left: 0;
              right: 0;
              top: 0;
              bottom: 0;
              background: rgba(200, 200, 255, 0.4);
              pointer-events: none;
            }
            .ProseMirror table .column-resize-handle {
              position: absolute;
              right: -2px;
              top: 0;
              bottom: -2px;
              width: 4px;
              background-color: #3b82f6;
              pointer-events: none;
            }
            .ProseMirror table p {
              margin: 0;
            }
          `
        }} />
      </div>
    </div>
  );
}
