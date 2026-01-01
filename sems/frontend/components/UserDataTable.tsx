"use client";

import { useMemo, useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import { Users, Search, X, Eye, Edit, Trash2, Key, CheckCircle2, XCircle } from "lucide-react";
import type { User, UserRole } from "@/types/document";
import { cn } from "@/lib/utils";
import { normalizeRole } from "@/lib/role-utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

interface UserDataTableProps {
  users: User[];
  loading?: boolean;
  currentUserRole?: UserRole;
  currentUserId?: string;
  onEdit?: (user: User) => void;
  onDelete?: (user: User) => void;
  onResetPassword?: (user: User) => void;
  onToggleActive?: (user: User) => void;
}

const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  REGISTRAR: "Registrar",
  OFFICER: "Officer",
  DATACLERK: "Data Clerk",
};

const roleColors: Record<UserRole, string> = {
  SUPER_ADMIN: "bg-purple-500",
  REGISTRAR: "bg-blue-500",
  OFFICER: "bg-green-500",
  DATACLERK: "bg-gray-500",
};

export function UserDataTable({
  users,
  loading,
  currentUserRole,
  currentUserId,
  onEdit,
  onDelete,
  onResetPassword,
  onToggleActive,
}: UserDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const isSuperAdmin = currentUserRole === "SUPER_ADMIN";

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <div className="font-medium">{row.getValue("email")}</div>
        ),
      },
      {
        accessorKey: "full_name",
        header: "Full Name",
        cell: ({ row }) => (
          <div className="font-medium">{row.getValue("full_name")}</div>
        ),
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => {
          const role = row.getValue("role") as UserRole | number;

          // Normalize role to handle both number and string formats
          // Note: role can be 0 (SUPER_ADMIN), so we check for undefined/null explicitly
          const normalizedRole = normalizeRole(role);
          if (!normalizedRole) {
            // If normalization failed, try to display the raw value
            if (role === undefined || role === null) {
              return <Badge variant="outline">Unknown</Badge>;
            }
            return <Badge variant="outline">{String(role)}</Badge>;
          }

          const label = roleLabels[normalizedRole] || String(role);
          const color = roleColors[normalizedRole] || "bg-gray-500";

          return (
            <Badge
              variant="default"
              className={cn(color, "text-white border-transparent font-medium")}
            >
              {label}
            </Badge>
          );
        },
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => {
          const isActive = row.getValue("is_active") as boolean;
          return (
            <div className="flex items-center gap-2">
              {isActive ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600">Active</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600">Inactive</span>
                </>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => {
          const date = new Date(row.getValue("created_at"));
          return <div className="text-muted-foreground">{date.toLocaleDateString()}</div>;
        },
      },
      {
        accessorKey: "last_login",
        header: "Last Login",
        cell: ({ row }) => {
          const lastLogin = row.getValue("last_login") as string | null;
          if (!lastLogin) {
            return <div className="text-muted-foreground">Never</div>;
          }
          const date = new Date(lastLogin);
          return <div className="text-muted-foreground">{date.toLocaleDateString()}</div>;
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const user = row.original;
          const isCurrentUser = user.id === currentUserId;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(user)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                {onToggleActive && !isCurrentUser && (
                  <DropdownMenuItem
                    onClick={() => onToggleActive(user)}
                  >
                    {user.is_active ? (
                      <>
                        <XCircle className="mr-2 h-4 w-4" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Activate
                      </>
                    )}
                  </DropdownMenuItem>
                )}
                {isSuperAdmin && onResetPassword && (
                  <DropdownMenuItem onClick={() => onResetPassword(user)}>
                    <Key className="mr-2 h-4 w-4" />
                    Reset Password
                  </DropdownMenuItem>
                )}
                {isSuperAdmin && onDelete && !isCurrentUser && (
                  <DropdownMenuItem
                    onClick={() => onDelete(user)}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [currentUserId, isSuperAdmin, onEdit, onDelete, onResetPassword, onToggleActive]
  );

  const table = useReactTable({
    data: users,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    globalFilterFn: (row, columnId, filterValue) => {
      const user = row.original;
      const searchValue = filterValue.toLowerCase();
      return (
        user.email.toLowerCase().includes(searchValue) ||
        user.full_name.toLowerCase().includes(searchValue)
      );
    },
    state: {
      sorting,
      globalFilter,
      columnVisibility,
    },
  });

  const filteredUsers = table.getFilteredRowModel().rows.map((row) => row.original);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-muted-foreground">Loading users...</div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Users className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-lg font-medium mb-2">No users found</p>
        <p className="text-sm text-muted-foreground">No users match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by email or name..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9 pr-9"
          />
          {globalFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
              onClick={() => setGlobalFilter("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <Eye className="h-4 w-4 mr-2" />
              Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48">
            <div className="space-y-2">
              <div className="text-sm font-medium mb-2">Toggle columns</div>
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <div key={column.id} className="flex items-center space-x-2">
                      <Checkbox
                        checked={column.getIsVisible()}
                        onCheckedChange={(checked) => column.toggleVisibility(checked)}
                      />
                      <label
                        htmlFor={column.id}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {column.id === "email"
                          ? "Email"
                          : column.id === "full_name"
                          ? "Full Name"
                          : column.id === "role"
                          ? "Role"
                          : column.id === "is_active"
                          ? "Status"
                          : column.id === "created_at"
                          ? "Created"
                          : column.id === "last_login"
                          ? "Last Login"
                          : column.id}
                      </label>
                    </div>
                  );
                })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <div
                        className={
                          header.column.getCanSort()
                            ? "cursor-pointer select-none hover:text-foreground"
                            : ""
                        }
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: " ↑",
                          desc: " ↓",
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {globalFilter && filteredUsers.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No users match your search.
        </div>
      )}
    </div>
  );
}
