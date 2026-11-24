"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, MoreVertical, Key, Edit, UserCheck, UserX, ChevronLeft, ChevronRight, Shield, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { User, Role } from "@/types";

interface AdminUserTableProps {
  users: User[];
  loading?: boolean;
  currentUserId?: string | null;
  onEdit?: (user: User) => void;
  onResetPassword?: (user: User) => void;
  onResendInvite?: (user: User) => void;
  onToggleActive?: (user: User) => void;
}

const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  SystemAdmin: "System Admin",
  Director: "Director",
  DeputyDirector: "Deputy Director",
  PrincipalManager: "Principal Manager",
  SeniorManager: "Senior Manager",
  Manager: "Manager",
  Staff: "Staff",
  SchoolAdmin: "Coordinator",
  SchoolStaff: "School Staff",
  PublicUser: "Public User",
  APIUSER: "API User",
};

function userAccountStatus(user: User): "inactive" | "pending" | "active" {
  if (!user.is_active) return "inactive";
  if (!user.last_login) return "pending";
  return "active";
}

export function AdminUserTable({
  users,
  loading = false,
  currentUserId,
  onEdit,
  onResetPassword,
  onResendInvite,
  onToggleActive,
}: AdminUserTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [pageSize, setPageSize] = React.useState(20);
  const [deactivateTarget, setDeactivateTarget] = React.useState<User | null>(null);

  const columns: ColumnDef<User>[] = React.useMemo(
    () => [
      {
        accessorKey: "email",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Email
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => <div className="font-medium">{row.getValue("email")}</div>,
      },
      {
        accessorKey: "username",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Username
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => <div>{row.getValue("username")}</div>,
      },
      {
        accessorKey: "full_name",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Full Name
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => <div>{row.getValue("full_name")}</div>,
      },
      {
        accessorKey: "role",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Role
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const role = row.getValue("role") as Role;
          return <div>{ROLE_DISPLAY_NAMES[role] || role}</div>;
        },
        sortingFn: (rowA, rowB) => {
          const roleA = rowA.getValue("role") as Role;
          const roleB = rowB.getValue("role") as Role;
          const nameA = ROLE_DISPLAY_NAMES[roleA] || roleA;
          const nameB = ROLE_DISPLAY_NAMES[roleB] || roleB;
          return nameA.localeCompare(nameB);
        },
      },
      {
        accessorKey: "school_name",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              School
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const schoolName = row.getValue("school_name") as string | null | undefined;
          const schoolId = row.original.school_id;

          if (schoolName && schoolId) {
            return (
              <Link
                href={`/dashboard/schools/${schoolId}`}
                className="text-primary hover:underline"
              >
                {schoolName}
              </Link>
            );
          }
          return <span className="text-muted-foreground">N/A</span>;
        },
      },
      {
        accessorKey: "is_active",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Status
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const status = userAccountStatus(row.original);
          if (status === "pending") {
            return (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-800 shadow-none dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200"
              >
                Pending invite
              </Badge>
            );
          }
          if (status === "active") {
            return (
              <Badge
                variant="outline"
                className="border-success/30 bg-success/10 text-success shadow-none"
              >
                Active
              </Badge>
            );
          }
          return (
            <Badge variant="secondary" className="shadow-none">
              Inactive
            </Badge>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Created
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const date = new Date(row.getValue("created_at"));
          return <div>{date.toLocaleDateString()}</div>;
        },
      },
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
          const user = row.original;
          const isCurrentUser = user.id === currentUserId;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(user)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                {onResendInvite && userAccountStatus(user) === "pending" && (
                  <DropdownMenuItem onClick={() => onResendInvite(user)}>
                    <Key className="mr-2 h-4 w-4" />
                    Resend invite
                  </DropdownMenuItem>
                )}
                {onResetPassword && userAccountStatus(user) !== "pending" && (
                  <DropdownMenuItem onClick={() => onResetPassword(user)}>
                    <Key className="mr-2 h-4 w-4" />
                    Send password reset
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => router.push(`/dashboard/admin/permissions/users/${user.id}`)}
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Manage Permissions
                </DropdownMenuItem>
                {onToggleActive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        if (user.is_active && user.role === "SchoolAdmin") {
                          setDeactivateTarget(user);
                          return;
                        }
                        onToggleActive(user);
                      }}
                      disabled={isCurrentUser}
                    >
                      {user.is_active ? (
                        <>
                          <UserX className="mr-2 h-4 w-4" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <UserCheck className="mr-2 h-4 w-4" />
                          Activate
                        </>
                      )}
                    </DropdownMenuItem>
                  </>
                )}
                {isCurrentUser && (
                  <DropdownMenuItem disabled>
                    <span className="text-xs text-muted-foreground">
                      Cannot deactivate yourself
                    </span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [currentUserId, onEdit, onResetPassword, onResendInvite, onToggleActive]
  );

  // Initialize table with empty data when loading to render headers
  const dataTable = useReactTable({
    data: loading ? [] : users,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, columnId, filterValue) => {
      const search = filterValue.toLowerCase();
      const email = (row.getValue("email") as string)?.toLowerCase() || "";
      const username = (row.getValue("username") as string)?.toLowerCase() || "";
      const fullName = (row.getValue("full_name") as string)?.toLowerCase() || "";
      const role = (row.getValue("role") as Role) || "";
      const roleName = ROLE_DISPLAY_NAMES[role]?.toLowerCase() || role.toLowerCase();
      const schoolName = ((row.getValue("school_name") as string) || "")?.toLowerCase() || "";

      return (
        email.includes(search) ||
        username.includes(search) ||
        fullName.includes(search) ||
        roleName.includes(search) ||
        schoolName.includes(search)
      );
    },
    initialState: {
      pagination: {
        pageSize: pageSize,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
  });

  // Update page size when state changes
  React.useEffect(() => {
    if (pageSize !== dataTable.getState().pagination.pageSize) {
      dataTable.setPageSize(pageSize);
      // Reset to first page when page size changes
      dataTable.setPageIndex(0);
    }
  }, [pageSize, dataTable]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Input
            placeholder="Search users..."
            value={globalFilter ?? ""}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="max-w-sm"
            disabled
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto" disabled>
                Columns <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </DropdownMenu>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {dataTable.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Loading users...
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Search users by email, name, role, or school..."
          value={globalFilter ?? ""}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              Columns <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {dataTable
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {dataTable.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {dataTable.getRowModel().rows?.length ? (
              dataTable.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
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
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-4">
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{dataTable.getRowModel().rows.length}</span> of{" "}
            <span className="font-medium text-foreground">{dataTable.getFilteredRowModel().rows.length}</span> filtered{" "}
            {dataTable.getFilteredRowModel().rows.length === 1 ? "user" : "users"}
            {dataTable.getFilteredRowModel().rows.length !== dataTable.getCoreRowModel().rows.length && (
              <span className="text-muted-foreground"> (Total: {dataTable.getCoreRowModel().rows.length})</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Rows per page:</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => {
                const newPageSize = parseInt(value, 10);
                setPageSize(newPageSize);
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <div className="text-sm text-muted-foreground whitespace-nowrap">
              Page {dataTable.getState().pagination.pageIndex + 1} of {dataTable.getPageCount() || 1}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => dataTable.previousPage()}
              disabled={!dataTable.getCanPreviousPage()}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => dataTable.nextPage()}
              disabled={!dataTable.getCanNextPage()}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <AlertDialog
      open={Boolean(deactivateTarget)}
      onOpenChange={(open) => {
        if (!open) setDeactivateTarget(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-destructive" />
            Deactivate coordinator
          </AlertDialogTitle>
          <AlertDialogDescription>
            This school will have no active coordinator until you invite a replacement.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deactivateTarget && (
          <div className="space-y-3 py-2">
            <div className="rounded-md border bg-muted p-4">
              <div className="text-sm font-medium">{deactivateTarget.full_name}</div>
              <div className="mt-1 text-sm text-muted-foreground">{deactivateTarget.email}</div>
              {deactivateTarget.school_name && (
                <div className="mt-1 text-sm text-muted-foreground">
                  {deactivateTarget.school_name}
                </div>
              )}
            </div>
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                The school portal will be blocked until a new coordinator is invited from the
                school page.
              </div>
            </div>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (deactivateTarget && onToggleActive) {
                onToggleActive(deactivateTarget);
              }
              setDeactivateTarget(null);
            }}
          >
            Deactivate coordinator
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
