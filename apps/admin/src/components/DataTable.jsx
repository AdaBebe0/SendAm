import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { SearchX, FilterX, ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

const FOCUSABLE_HEADER = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

// Pagination cursors and page size are not filters — they must not trigger the
// "Reset Filters" recovery action in the empty state.
const NON_FILTER_PARAMS = new Set(['after', 'before', 'limit']);

function compareValues(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);

  const aTime = Date.parse(a);
  const bTime = Date.parse(b);
  if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime;

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

// Sort state is an ordered list of { key, direction }: the first entry is the
// primary sort and each later entry only breaks ties left by the ones before it.
function normalizeSort(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

const flipDirection = (direction) => (direction === 'ascending' ? 'descending' : 'ascending');

function sortRows(data, columns, sortList) {
  if (!data) return [];
  const active = sortList.filter((entry) =>
    columns.some((c) => c.sortable && (c.accessor ?? c.header) === entry.key)
  );
  if (active.length === 0) return data;

  return [...data].sort((a, b) => {
    for (const { key, direction } of active) {
      const factor = direction === 'descending' ? -1 : 1;
      const result = factor * compareValues(a[key], b[key]);
      if (result !== 0) return result;
    }
    return 0;
  });
}

export default function DataTable({
  columns,
  data,
  caption,
  keyField = 'id',
  onRowClick,
  rowClassName = '',
  defaultSort = null,
  emptyState,
  filtersActive,
  onResetFilters,
  rowHeight = 53,
  maxHeight = 600,
  overscan = 5,
  virtualizeThreshold = 50,
}) {
  const [sort, setSort] = useState(() => normalizeSort(defaultSort));
  const [searchParams, setSearchParams] = useSearchParams();
  const hasActiveFilters =
    filtersActive ??
    Array.from(searchParams.keys()).some((key) => !NON_FILTER_PARAMS.has(key));

  const sortKeyOf = (column) => column.accessor ?? column.header;
  const sortedData = useMemo(() => sortRows(data, columns, sort), [data, columns, sort]);

  // Plain click: sort by this column alone, flipping direction if it already
  // leads the sort. Shift+click: add it as a secondary key, or flip its direction
  // when it is already part of the sort. Plain clicks clear any secondary keys.
  const handleSort = (column, event) => {
    const key = sortKeyOf(column);
    setSort((current) => {
      const existing = current.findIndex((entry) => entry.key === key);
      if (event?.shiftKey) {
        if (existing === -1) return [...current, { key, direction: 'ascending' }];
        return current.map((entry, index) =>
          index === existing ? { key, direction: flipDirection(entry.direction) } : entry
        );
      }
      if (current[0]?.key === key) {
        return [{ key, direction: flipDirection(current[0].direction) }];
      }
      return [{ key, direction: 'ascending' }];
    });
  };

  const ariaSortFor = (column) => {
    if (!column.sortable) return undefined;
    const entry = sort.find((item) => item.key === sortKeyOf(column));
    if (!entry) return 'none';
    return entry.direction === 'descending' ? 'descending' : 'ascending';
  };

  const containerRef = useRef(null);
  const rowRefs = useRef(new Map());
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(
    typeof maxHeight === 'number' ? maxHeight : 600
  );
  const [focusedIndex, setFocusedIndex] = useState(null);

  const totalRows = sortedData ? sortedData.length : 0;
  const isVirtualized = totalRows >= virtualizeThreshold;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (el.clientHeight > 0) {
        setContainerHeight(el.clientHeight);
      }
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, []);

  const handleScroll = useCallback((e) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const { startIndex, topPadding, bottomPadding, visibleRows } = useMemo(() => {
    if (!isVirtualized || totalRows === 0) {
      return {
        startIndex: 0,
        endIndex: totalRows - 1,
        topPadding: 0,
        bottomPadding: 0,
        visibleRows: sortedData || [],
      };
    }

    const calculatedStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / rowHeight);
    const calculatedEnd = Math.min(totalRows - 1, calculatedStart + visibleCount + overscan * 2);

    const start = Math.max(0, calculatedStart);
    const end = Math.min(totalRows - 1, calculatedEnd);

    const topPad = start * rowHeight;
    const bottomPad = Math.max(0, (totalRows - 1 - end) * rowHeight);
    const sliced = sortedData.slice(start, end + 1);

    return {
      startIndex: start,
      endIndex: end,
      topPadding: topPad,
      bottomPadding: bottomPad,
      visibleRows: sliced,
    };
  }, [isVirtualized, totalRows, scrollTop, rowHeight, overscan, containerHeight, sortedData]);

  const scrollRowIntoView = useCallback(
    (targetIndex) => {
      const el = containerRef.current;
      if (!el || targetIndex == null || targetIndex < 0 || targetIndex >= totalRows) return;

      const targetTop = targetIndex * rowHeight;
      const targetBottom = targetTop + rowHeight;
      const currentScrollTop = el.scrollTop || scrollTop;
      const viewHeight = el.clientHeight || containerHeight;

      let newScrollTop = null;
      if (targetTop < currentScrollTop) {
        newScrollTop = targetTop;
      } else if (targetBottom > currentScrollTop + viewHeight) {
        newScrollTop = targetBottom - viewHeight;
      }

      if (newScrollTop != null) {
        el.scrollTop = newScrollTop;
        setScrollTop(newScrollTop);
      }
    },
    [totalRows, rowHeight, scrollTop, containerHeight]
  );

  const focusRow = useCallback(
    (index) => {
      const targetIndex = Math.max(0, Math.min(totalRows - 1, index));
      setFocusedIndex(targetIndex);
      scrollRowIntoView(targetIndex);
      const domEl = rowRefs.current.get(targetIndex);
      if (domEl) {
        domEl.focus();
      }
    },
    [totalRows, scrollRowIntoView]
  );

  useEffect(() => {
    if (focusedIndex != null) {
      const domEl = rowRefs.current.get(focusedIndex);
      if (domEl && document.activeElement !== domEl) {
        domEl.focus();
      }
    }
  }, [focusedIndex, visibleRows]);

  const handleKeyDown = (e, rowIndex) => {
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        focusRow(rowIndex + 1);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        focusRow(rowIndex - 1);
        break;
      }
      case 'Home': {
        e.preventDefault();
        focusRow(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        focusRow(totalRows - 1);
        break;
      }
      case 'Enter':
      case ' ': {
        if (onRowClick) {
          e.preventDefault();
          onRowClick(sortedData[rowIndex]);
        }
        break;
      }
      default:
        break;
    }
  };

  const renderSortButton = (col) => {
    const sortIndex = sort.findIndex((entry) => entry.key === sortKeyOf(col));
    const entry = sortIndex === -1 ? null : sort[sortIndex];
    const showPriority = sort.length > 1 && entry !== null;
    return (
      <button
        type="button"
        onClick={(event) => handleSort(col, event)}
        title="Click to sort. Shift+click to add a secondary sort."
        className={`inline-flex items-center gap-1.5 uppercase font-semibold ${FOCUSABLE_HEADER}`}
      >
        {col.header}
        {entry === null ? (
          <ChevronsUpDown size={14} aria-hidden="true" />
        ) : entry.direction === 'ascending' ? (
          <ArrowUp size={14} aria-hidden="true" />
        ) : (
          <ArrowDown size={14} aria-hidden="true" />
        )}
        {showPriority && (
          <>
            <span
              aria-hidden="true"
              data-testid="sort-priority-badge"
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white"
            >
              {sortIndex + 1}
            </span>
            <span className="sr-only">{`, sort priority ${sortIndex + 1}`}</span>
          </>
        )}
      </button>
    );
  };

  if (!data || data.length === 0) {
    const {
      title = 'No records found.',
      description = hasActiveFilters
        ? 'No records match your current search or filters. Reset them to see the full list again.'
        : 'There are no records to show right now. New records will appear here as soon as they exist.',
      icon: Icon = hasActiveFilters ? FilterX : SearchX,
    } = emptyState || {};

    const handleReset = () => {
      if (onResetFilters) {
        onResetFilters();
        return;
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const key of Array.from(next.keys())) {
          if (key !== 'limit') next.delete(key);
        }
        return next;
      });
    };

    return (
      <div
        role="region"
        aria-label={caption ? `${caption} empty state` : 'Empty table'}
        className="w-full bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 p-8 sm:p-12 text-center shadow-sm"
      >
        <div className="mx-auto w-12 h-12 rounded-full bg-gray-50 dark:bg-slate-800 flex items-center justify-center text-gray-400 dark:text-gray-500 mb-3">
          <Icon className="w-6 h-6" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-4">{description}</p>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg text-primary dark:text-teal-400 bg-secondary dark:bg-teal-950/60 hover:bg-emerald-100 dark:hover:bg-teal-900/60 transition-colors"
          >
            Reset Filters
          </button>
        )}
      </div>
    );
  }

  const containerStyles = isVirtualized
    ? {
        maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
        overflowY: 'auto',
      }
    : undefined;

  return (
    <div
      ref={containerRef}
      onScroll={isVirtualized ? handleScroll : undefined}
      style={containerStyles}
      data-testid="datatable-container"
      data-virtualized={isVirtualized}
      className="w-full max-w-full overflow-x-auto bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm focus:outline-none"
      tabIndex={isVirtualized ? 0 : undefined}
      aria-label={caption ? `${caption} scrollable view` : undefined}
    >
      <table className="min-w-max w-full text-sm text-left text-gray-600 dark:text-gray-300 border-collapse">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-slate-800/60 border-b border-gray-100 dark:border-slate-800 sticky top-0 z-10">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                scope="col"
                aria-sort={ariaSortFor(col)}
                className="px-4 sm:px-6 py-4 whitespace-nowrap bg-gray-50 dark:bg-slate-800"
              >
                {col.sortable ? (
                  renderSortButton(col)
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Top virtual spacer */}
          {isVirtualized && topPadding > 0 && (
            <tr style={{ height: `${topPadding}px` }} aria-hidden="true">
              <td colSpan={columns.length} style={{ padding: 0, border: 'none' }} />
            </tr>
          )}

          {/* Visible Rows */}
          {visibleRows.map((row, relativeIdx) => {
            const absoluteIdx = isVirtualized ? startIndex + relativeIdx : relativeIdx;
            const rowKey = row[keyField] || absoluteIdx;
            const isClickable = Boolean(onRowClick);

            return (
              <tr
                key={rowKey}
                ref={(el) => {
                  if (el) rowRefs.current.set(absoluteIdx, el);
                  else rowRefs.current.delete(absoluteIdx);
                }}
                data-row-index={absoluteIdx}
                className={`border-b border-gray-50 dark:border-slate-800/60 hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-gray-100 dark:focus:bg-slate-800 ${rowClassName}`}
                onClick={isClickable ? () => onRowClick(row) : undefined}
                onKeyDown={(e) => handleKeyDown(e, absoluteIdx)}
                tabIndex={isClickable || isVirtualized ? 0 : undefined}
                aria-label={isClickable ? `View details for row ${absoluteIdx + 1}` : undefined}
              >
                {columns.map((col, colIdx) => (
                  <td key={colIdx} className="px-4 sm:px-6 py-4 whitespace-nowrap">
                    {col.render ? col.render(row) : row[col.accessor]}
                  </td>
                ))}
              </tr>
            );
          })}

          {/* Bottom virtual spacer */}
          {isVirtualized && bottomPadding > 0 && (
            <tr style={{ height: `${bottomPadding}px` }} aria-hidden="true">
              <td colSpan={columns.length} style={{ padding: 0, border: 'none' }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
