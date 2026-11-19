"use client";

import { Label } from "@/components/ui/label";
import type { ProgrammeTypeTreeNode } from "@/types";

interface ProgrammeTypeEnablementTreeProps {
  nodes: ProgrammeTypeTreeNode[];
  enabledIds: Set<number>;
  onToggle: (id: number, enabled: boolean) => void;
  disabled?: boolean;
  depth?: number;
}

export function ProgrammeTypeEnablementTree({
  nodes,
  enabledIds,
  onToggle,
  disabled = false,
  depth = 0,
}: ProgrammeTypeEnablementTreeProps) {
  return (
    <div className="space-y-2">
      {nodes.map((node) => (
        <div key={node.id} style={{ marginLeft: depth * 16 }}>
          <Label className="flex items-center gap-2 font-normal">
            <input
              type="checkbox"
              checked={enabledIds.has(node.id)}
              onChange={(e) => onToggle(node.id, e.target.checked)}
              disabled={disabled}
            />
            <span>{node.name}</span>
            <span className="text-xs text-muted-foreground">({node.code})</span>
          </Label>
          {node.children?.length > 0 && (
            <ProgrammeTypeEnablementTree
              nodes={node.children}
              enabledIds={enabledIds}
              onToggle={onToggle}
              disabled={disabled}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** Collect all node ids in a subtree (including root). */
export function collectTreeIds(nodes: ProgrammeTypeTreeNode[]): number[] {
  const ids: number[] = [];
  const walk = (list: ProgrammeTypeTreeNode[]) => {
    for (const n of list) {
      ids.push(n.id);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

/** Find a root node and return its children (subtree under root, including root as first level option). */
export function findRootSubtree(
  tree: ProgrammeTypeTreeNode[],
  rootId: number
): ProgrammeTypeTreeNode | null {
  for (const node of tree) {
    if (node.id === rootId) return node;
    const found = findRootSubtree(node.children || [], rootId);
    if (found) return found;
  }
  return null;
}
