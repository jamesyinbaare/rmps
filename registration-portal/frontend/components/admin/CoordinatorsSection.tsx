"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCoordinators } from "@/lib/api";
import { CreateCoordinatorDialog } from "@/components/admin/CreateCoordinatorDialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { User } from "@/types";

export function CoordinatorsSection({ schoolId }: { schoolId: number }) {
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const data = await getCoordinators(schoolId);
      setAdmins(data);
    } catch (error) {
      toast.error("Failed to load coordinators");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Coordinators</CardTitle>
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Coordinator
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : admins.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No administrators found</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell>{admin.email}</TableCell>
                  <TableCell>{admin.full_name}</TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CreateCoordinatorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={loadAdmins}
        defaultSchoolId={schoolId}
      />
    </Card>
  );
}
