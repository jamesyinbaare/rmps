"use client";

import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchWithAuth } from "@/lib/api";

type ManualMarkdownProps = {
  content: string;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function childrenToText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(childrenToText).join("");
  }
  if (children && typeof children === "object" && "props" in children) {
    const element = children as { props?: { children?: ReactNode } };
    return childrenToText(element.props?.children);
  }
  return "";
}

function ManualImage({ src, alt }: { src?: string; alt?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      if (!src) {
        setFailed(true);
        return;
      }

      // Absolute or data URLs load normally
      if (/^(https?:|data:|blob:)/i.test(src)) {
        setBlobUrl(src);
        return;
      }

      const relative = src.replace(/^\.\//, "");
      if (!relative.startsWith("images/")) {
        setBlobUrl(src);
        return;
      }

      try {
        const response = await fetchWithAuth(
          `/api/v1/school/manuals/assets/${relative}`
        );
        if (!response.ok) {
          throw new Error(`Failed to load image (${response.status})`);
        }
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (error) {
        console.error("Failed to load manual image", src, error);
        if (!cancelled) setFailed(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (failed) {
    return (
      <span className="block rounded-md border border-dashed border-border bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
        {alt || "Screenshot unavailable"}
      </span>
    );
  }

  if (!blobUrl) {
    return (
      <span className="block h-40 animate-pulse rounded-md border border-border bg-muted/50" />
    );
  }

  // Use <span> (not <figure>/<figcaption>) — react-markdown wraps images in <p>.
  return (
    <span className="my-4 block space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={blobUrl}
        alt={alt || ""}
        className="block h-auto w-full rounded-md border border-border shadow-sm"
      />
      {alt ? (
        <span className="block text-xs text-muted-foreground">{alt}</span>
      ) : null}
    </span>
  );
}

export function ManualMarkdown({ content }: ManualMarkdownProps) {
  return (
    <div className="manual-prose max-w-4xl space-y-4 text-sm leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => {
            const text = childrenToText(children);
            return (
              <h1
                id={slugify(text)}
                className="scroll-mt-24 border-b border-border pb-2 text-2xl font-semibold tracking-tight"
              >
                {children}
              </h1>
            );
          },
          h2: ({ children }) => {
            const text = childrenToText(children);
            return (
              <h2
                id={slugify(text)}
                className="scroll-mt-24 pt-4 text-xl font-semibold tracking-tight"
              >
                {children}
              </h2>
            );
          },
          h3: ({ children }) => {
            const text = childrenToText(children);
            return (
              <h3
                id={slugify(text)}
                className="scroll-mt-24 pt-2 text-base font-semibold"
              >
                {children}
              </h3>
            );
          },
          h4: ({ children }) => (
            <h4 className="pt-1 text-sm font-semibold">{children}</h4>
          ),
          p: ({ children, node }) => {
            const kids = node?.children ?? [];
            const onlyImage =
              kids.length === 1 &&
              kids[0]?.type === "element" &&
              kids[0].tagName === "img";
            if (onlyImage) {
              return <div className="my-1">{children}</div>;
            }
            return (
              <p className="text-muted-foreground [&_strong]:text-foreground">
                {children}
              </p>
            );
          },
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          table: ({ children }) => (
            <div className="my-4 w-full overflow-x-auto rounded-md border border-border">
              <table className="w-full table-auto border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/60">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="align-top">{children}</tr>,
          th: ({ children }) => (
            <th className="break-words border-b border-border px-3 py-2.5 font-medium text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="break-words border-b border-border px-3 py-2.5 align-top text-muted-foreground">
              {children}
            </td>
          ),
          code: ({ children }) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
              {children}
            </code>
          ),
          hr: () => <hr className="my-6 border-border" />,
          a: ({ href, children }) => (
            <a
              href={href}
              className="font-medium text-foreground underline underline-offset-2"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          img: ({ src, alt }) => (
            <ManualImage
              src={typeof src === "string" ? src : undefined}
              alt={alt}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export type ManualTocItem = {
  id: string;
  title: string;
  level: 2 | 3;
};

export function extractManualToc(markdown: string): ManualTocItem[] {
  const items: ManualTocItem[] = [];
  const lines = markdown.split("\n");
  for (const line of lines) {
    const match = /^(#{2,3})\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const level = match[1].length as 2 | 3;
    const title = match[2].replace(/\*\*/g, "").trim();
    items.push({ id: slugify(title), title, level });
  }
  return items;
}
