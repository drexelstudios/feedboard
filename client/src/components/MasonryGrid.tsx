import { useRef, useEffect, useState, useCallback, type ReactNode } from "react";

interface MasonryGridProps {
  columns: number;
  gap?: number;
  children: ReactNode[];
  className?: string;
}

/**
 * JS-based masonry layout that distributes items into the shortest column,
 * giving an even spread across all columns with tight vertical packing.
 *
 * Uses absolute positioning measured from real DOM heights, with a
 * ResizeObserver to re-layout when children change size.
 */
export default function MasonryGrid({
  columns,
  gap = 16,
  children,
  className,
}: MasonryGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<
    { left: number; top: number; width: number }[]
  >([]);
  const [containerHeight, setContainerHeight] = useState(0);

  const layout = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = Array.from(
      container.querySelectorAll<HTMLElement>(":scope > [data-masonry-item]")
    );
    if (items.length === 0) {
      setPositions([]);
      setContainerHeight(0);
      return;
    }

    const containerWidth = container.clientWidth;
    const colWidth = (containerWidth - gap * (columns - 1)) / columns;
    const colHeights = new Array(columns).fill(0);
    const newPositions: { left: number; top: number; width: number }[] = [];

    for (const item of items) {
      // Find shortest column
      const shortestCol = colHeights.indexOf(Math.min(...colHeights));
      const left = shortestCol * (colWidth + gap);
      const top = colHeights[shortestCol];

      newPositions.push({ left, top, width: colWidth });

      // Measure real height — temporarily make visible and positioned for measurement
      item.style.position = "absolute";
      item.style.width = `${colWidth}px`;
      item.style.left = `${left}px`;
      item.style.top = `${top}px`;
      item.style.visibility = "visible";

      const height = item.offsetHeight;
      colHeights[shortestCol] += height + gap;
    }

    setPositions(newPositions);
    setContainerHeight(Math.max(...colHeights) - gap);
  }, [columns, gap]);

  // Re-layout on children or column count change
  useEffect(() => {
    layout();
  }, [layout, children]);

  // ResizeObserver for container width changes and child size changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => layout());
    ro.observe(container);

    // Also observe each child for size changes (e.g. collapse/expand)
    const items = container.querySelectorAll<HTMLElement>(
      ":scope > [data-masonry-item]"
    );
    items.forEach((item) => ro.observe(item));

    return () => ro.disconnect();
  }, [layout, children]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", height: containerHeight || "auto" }}
    >
      {Array.isArray(children)
        ? children.map((child, i) => (
            <div
              key={i}
              data-masonry-item
              style={{
                position: "absolute",
                left: positions[i]?.left ?? 0,
                top: positions[i]?.top ?? 0,
                width: positions[i]?.width ?? "100%",
                transition: "left 200ms ease, top 200ms ease",
              }}
            >
              {child}
            </div>
          ))
        : children}
    </div>
  );
}
