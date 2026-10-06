import { PaginatedResponse } from '@bachatly/types';

export interface PaginationQuery {
  page?: number | string;
  pageSize?: number | string;
  sort?: string;
  order?: 'asc' | 'desc' | string;
}

export interface ParsedPagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  orderBy: Record<string, 'asc' | 'desc'> | undefined;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Allowed sort fields per resource — callers pass a whitelist to prevent sort injection. */
export function parsePagination(
  query: PaginationQuery,
  allowedSortFields: string[] = ['createdAt'],
  defaultSort = 'createdAt',
): ParsedPagination {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(String(query.pageSize ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  );
  const sort = allowedSortFields.includes(query.sort ?? '')
    ? (query.sort as string)
    : defaultSort;
  const order: 'asc' | 'desc' = query.order === 'asc' ? 'asc' : 'desc';

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { [sort]: order },
  };
}

export function buildPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
