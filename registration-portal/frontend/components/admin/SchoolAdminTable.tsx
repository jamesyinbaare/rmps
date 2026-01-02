"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import type { User } from "@/types";

interface CoordinatorTableProps {
  admins: User[];
}

export function CoordinatorTable({ admins }: CoordinatorTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Full Name</TableHead>
          <TableHead>School ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {admins.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              No coordinators found
            </TableCell>
          </TableRow>
        ) : (
          admins.map((admin) => (
            <TableRow key={admin.id}>
              <TableCell>{admin.email}</TableCell>
              <TableCell>{admin.full_name}</TableCell>
              <TableCell>
                {admin.school_id ? (
                  <Link
                    href={`/dashboard/schools/${admin.school_id}`}
                    className="text-[var(--primary)] hover:underline"
                  >
                    {admin.school_id}
                  </Link>
                ) : (
                  "N/A"
                )}
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    admin.is_active
                      ? "bg-[var(--success)]/10 text-[var(--success)]"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {admin.is_active ? "Active" : "Inactive"}
                </span>
              </TableCell>
              <TableCell>{new Date(admin.created_at).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">
                {admin.school_id && (
                  <Link href={`/dashboard/schools/${admin.school_id}`}>
                    <Button variant="ghost" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      View School
                    </Button>
                  </Link>
                )}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
