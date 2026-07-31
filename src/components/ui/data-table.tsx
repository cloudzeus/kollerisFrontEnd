"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  ColumnResizeMode,
} from "@tanstack/react-table";

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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronRight, Download, Settings, ArrowUpDown, ArrowUp, ArrowDown, ChevronFirst, ChevronLeft, ChevronLast } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** When set, replaces the default "Data Table (N items)" header title */
  title?: React.ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  pageSize?: number;
  totalItems?: number;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  expandableContent?: (item: TData) => React.ReactNode;
  showColumnSelector?: boolean;
  showExport?: boolean;
  onExport?: () => void;
  loading?: boolean;
  className?: string;
  selectedRows?: string[];
  onRowSelectionChange?: (selectedRows: string[]) => void;
  showInternetProductsFilter?: boolean;
  internetProductsOnly?: boolean;
  onInternetProductsFilterChange?: (checked: boolean) => void;
  /** Stable row id for expandable rows and selection. Defaults to index. */
  getRowId?: (row: TData, index: number) => string;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (visibility: VisibilityState) => void;
  columnVisibilityStorageKey?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  title,
  searchPlaceholder = "Search...",
  searchValue = "",
  onSearchChange,
  pageSize = 200,
  totalItems = 0,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  onPageSizeChange,
  expandableContent,
  showColumnSelector = true,
  showExport = true,
  onExport,
  loading = false,
  className,
  selectedRows = [],
  onRowSelectionChange,
  showInternetProductsFilter = false,
  internetProductsOnly = false,
  onInternetProductsFilterChange,
  getRowId,
  columnVisibility: controlledColumnVisibility,
  onColumnVisibilityChange,
  columnVisibilityStorageKey,
}: DataTableProps<TData, TValue>) {
  const pathname = usePathname();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());
  /** Avoid infinite parent↔child loops: only notify when selected ids actually change. */
  const lastNotifiedSelectionKeyRef = React.useRef<string | null>(null);
  const columnIdentity = React.useMemo(() => {
    return columns
      .map((column, index) => {
        const id = (column as { id?: string }).id;
        const accessorKey = (column as { accessorKey?: string }).accessorKey;
        return id || accessorKey || `col-${index}`;
      })
      .join("|");
  }, [columns]);

  const resolvedColumnVisibilityStorageKey = React.useMemo(() => {
    if (columnVisibilityStorageKey) return columnVisibilityStorageKey;
    if (!showColumnSelector) return null;
    return `datatable-column-visibility:${pathname}:${columnIdentity}`;
  }, [columnVisibilityStorageKey, showColumnSelector, pathname, columnIdentity]);

  React.useEffect(() => {
    if (!controlledColumnVisibility) return;
    setColumnVisibility(controlledColumnVisibility);
  }, [controlledColumnVisibility]);

  React.useEffect(() => {
    if (controlledColumnVisibility) return;
    if (!resolvedColumnVisibilityStorageKey) return;
    try {
      const raw = localStorage.getItem(resolvedColumnVisibilityStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") return;
      const sanitized = Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => typeof value === "boolean")
      ) as VisibilityState;
      setColumnVisibility(sanitized);
    } catch {
      // Ignore malformed local storage values.
    }
  }, [controlledColumnVisibility, resolvedColumnVisibilityStorageKey]);

  React.useEffect(() => {
    if (controlledColumnVisibility) return;
    if (!resolvedColumnVisibilityStorageKey) return;
    try {
      localStorage.setItem(
        resolvedColumnVisibilityStorageKey,
        JSON.stringify(columnVisibility)
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [controlledColumnVisibility, resolvedColumnVisibilityStorageKey, columnVisibility]);

  const handleColumnVisibilityChange = React.useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      setColumnVisibility((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        onColumnVisibilityChange?.(next);
        return next;
      });
    },
    [onColumnVisibilityChange]
  );

  const table = useReactTable({
    data,
    columns,
    getRowId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onRowSelectionChange: setRowSelection,
    columnResizeMode: "onChange" as ColumnResizeMode,
    enableColumnResizing: true,
    enableRowSelection: !!onRowSelectionChange,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  React.useEffect(() => {
    if (!onRowSelectionChange) return;
    const ids = Object.keys(rowSelection).filter((id) => rowSelection[id]);
    const key = ids.slice().sort().join("\u0001");
    if (key === lastNotifiedSelectionKeyRef.current) return;
    lastNotifiedSelectionKeyRef.current = key;
    onRowSelectionChange(ids);
  }, [rowSelection, onRowSelectionChange]);

  const toggleRowExpansion = (rowId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(rowId)) {
      newExpanded.delete(rowId);
    } else {
      newExpanded.add(rowId);
    }
    setExpandedRows(newExpanded);
  };

  // Initial load: show skeleton. Page change / refetch: show table with overlay so pagination stays visible.
  if (loading && totalItems === 0) {
    return <DataTableSkeleton />;
  }

  return (
    <Card className={cn(className, "relative")}>
      {loading && totalItems > 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Loading…</span>
          </div>
        </div>
      )}
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {title ?? <span>Data Table ({totalItems.toLocaleString()} items)</span>}
          </div>
          <div className="flex items-center gap-2">
            {showInternetProductsFilter && onInternetProductsFilterChange && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="internet-products"
                  checked={internetProductsOnly}
                  onCheckedChange={onInternetProductsFilterChange}
                />
                <label
                  htmlFor="internet-products"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Internet Products
                </label>
              </div>
            )}
            {showExport && onExport && (
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
            {showColumnSelector && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table
                    .getAllColumns()
                    .filter((column: any) => column.getCanHide())
                    .map((column: any) => {
                      return (
                        <DropdownMenuCheckboxItem
                          key={column.id}
                          className="capitalize"
                          checked={column.getIsVisible()}
                          onCheckedChange={(value) =>
                            column.toggleVisibility(!!value)
                          }
                        >
                          {column.id}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Search Bar */}
        {onSearchChange && (
          <div className="mb-4">
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="max-w-sm"
            />
          </div>
        )}

        {/* Table */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup: any) => (
                <TableRow key={headerGroup.id} className="border-b hover:bg-transparent data-[state=selected]:bg-transparent">
                  {onRowSelectionChange && (
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          table.getIsAllPageRowsSelected() ||
                          (table.getIsSomePageRowsSelected() && "indeterminate")
                        }
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                      />
                    </TableHead>
                  )}
                  {expandableContent && (
                    <TableHead className="w-12"></TableHead>
                  )}
                  {headerGroup.headers.map((header: any) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        className="text-xs relative"
                        style={{ width: header.getSize() }}
                      >
                        <div className="flex items-center justify-between pr-4">
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              title={
                                sorted === "asc"
                                  ? "Sorted ascending — click for descending, then clear"
                                  : sorted === "desc"
                                    ? "Click to clear sort"
                                    : "Sort column"
                              }
                              className="-ml-1 inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-semibold text-inherit hover:bg-muted/60"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sorted === "asc" ? (
                                <ArrowUp className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                              ) : sorted === "desc" ? (
                                <ArrowDown className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 shrink-0 opacity-55" aria-hidden />
                              )}
                            </button>
                          ) : (
                            <div className="px-1.5 py-1 text-xs font-semibold text-inherit">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </div>
                          )}
                        </div>
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={`absolute right-0 top-0 h-full w-6 cursor-col-resize select-none touch-none z-30 transition-colors duration-150 border-l border-border bg-muted/50 text-inherit
                            ${header.column.getIsResizing() ? "bg-primary/40 border-primary" : "hover:bg-muted/80 hover:border-muted-foreground/40"}
                          `}
                        />
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row: any) => (
                <React.Fragment key={row.id}>
                  <TableRow
                    data-state={row.getIsSelected() && "selected"}
                    className="hover:bg-muted/50"
                  >
                    {onRowSelectionChange && (
                      <TableCell className="w-12">
                        <Checkbox
                          checked={row.getIsSelected()}
                          onCheckedChange={(value) => row.toggleSelected(!!value)}
                          aria-label="Select row"
                        />
                      </TableCell>
                    )}
                    {expandableContent && (
                      <TableCell className="w-12">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRowExpansion(row.id)}
                          className="h-6 w-6 p-0"
                        >
                          {expandedRows.has(row.id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    )}
                    {row.getVisibleCells().map((cell: any) => (
                      <TableCell
                        key={cell.id}
                        className="text-xs"
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  {expandableContent && expandedRows.has(row.id) && (
                    <TableRow>
                      <TableCell colSpan={row.getVisibleCells().length + (onRowSelectionChange ? 2 : 1)}>
                        <div className="p-4 bg-muted/30 rounded-lg">
                          {expandableContent(row.original)}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-6">
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems.toLocaleString()} total items
            </div>
            {onPageSizeChange && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Page size:</span>
                <select
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                  <option value={1000}>1,000</option>
                  <option value={2500}>2,500</option>
                  <option value={5000}>5,000</option>
                </select>
              </div>
            )}
          </div>
          {totalPages > 1 && onPageChange && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(1)}
                disabled={currentPage <= 1}
              >
                <ChevronFirst className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(10, totalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(totalPages - 9, currentPage - 4)) + i;
                  if (pageNum > totalPages) return null;

                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === currentPage ? "default" : "outline"}
                      size="sm"
                      onClick={() => onPageChange(pageNum)}
                      className="w-8 h-8 p-0"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(totalPages)}
                disabled={currentPage >= totalPages}
              >
                <ChevronLast className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DataTableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-6 w-48" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 