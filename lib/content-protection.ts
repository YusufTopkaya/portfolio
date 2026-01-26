/**
 * Content Protection Utilities
 *
 * Provides security features to protect web content:
 * - Prevents image downloading (right-click, drag)
 * - Blocks developer tools access
 * - Disables text selection (except inputs)
 */

export function preventImageDownload(): () => void {
  const disableContextMenu = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === "IMG" ||
      target.closest("img") ||
      target.style.backgroundImage
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const preventDragStart = (e: DragEvent): void => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG" || target.closest("img")) {
      e.preventDefault();
    }
  };

  document.addEventListener("contextmenu", disableContextMenu, true);
  document.addEventListener("dragstart", preventDragStart, true);

  const style = document.createElement("style");
  style.id = "content-protection-styles";
  style.textContent = `
    img {
      -webkit-user-drag: none;
      -khtml-user-drag: none;
      -moz-user-drag: none;
      -o-user-drag: none;
      user-drag: none;
      -webkit-touch-callout: none;
    }

    img,
    [style*="background-image"] {
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
    }
  `;
  document.head.appendChild(style);

  return () => {
    document.removeEventListener("contextmenu", disableContextMenu, true);
    document.removeEventListener("dragstart", preventDragStart, true);
    const styleEl = document.getElementById("content-protection-styles");
    if (styleEl) styleEl.remove();
  };
}

export function blockDevTools(): () => void {
  const disableDevToolsShortcuts = (e: KeyboardEvent): void => {
    if (e.key === "F12") {
      e.preventDefault();
      return;
    }

    if (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i")) {
      e.preventDefault();
      return;
    }

    if (e.ctrlKey && e.shiftKey && (e.key === "J" || e.key === "j")) {
      e.preventDefault();
      return;
    }

    if (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "c")) {
      e.preventDefault();
      return;
    }

    if (e.ctrlKey && (e.key === "u" || e.key === "U")) {
      e.preventDefault();
      return;
    }

    if (e.metaKey && e.altKey && (e.key === "i" || e.key === "I")) {
      e.preventDefault();
      return;
    }

    if (e.metaKey && e.altKey && (e.key === "j" || e.key === "J")) {
      e.preventDefault();
      return;
    }

    if (e.metaKey && e.altKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      return;
    }

    if (e.metaKey && (e.key === "u" || e.key === "U")) {
      e.preventDefault();
      return;
    }
  };

  const disableRightClick = (e: MouseEvent): void => {
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  document.addEventListener("keydown", disableDevToolsShortcuts, true);
  document.addEventListener("contextmenu", disableRightClick, true);

  return () => {
    document.removeEventListener("keydown", disableDevToolsShortcuts, true);
    document.removeEventListener("contextmenu", disableRightClick, true);
  };
}

export function preventTextSelection(): () => void {
  const style = document.createElement("style");
  style.id = "text-selection-protection";
  style.textContent = `
    * {
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
    }

    input,
    textarea,
    [contenteditable="true"],
    [role="textbox"] {
      -webkit-user-select: text;
      -moz-user-select: text;
      -ms-user-select: text;
      user-select: text;
    }
  `;
  document.head.appendChild(style);

  return () => {
    const styleEl = document.getElementById("text-selection-protection");
    if (styleEl) styleEl.remove();
  };
}

export function enableDragToScroll(): () => void {
  if ("ontouchstart" in window) return () => {};

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let scrollLeft = 0;
  let scrollTop = 0;
  let currentTarget: HTMLElement | Window | null = null;
  let scrollDirection: "vertical" | "horizontal" | null = null;
  const dragThreshold = 5;
  let hasDragged = false;

  const isVerticallyScrollable = (el: HTMLElement): boolean => {
    const style = getComputedStyle(el);
    const overflowY = style.overflowY;
    return (
      (overflowY === "auto" || overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight
    );
  };

  const isHorizontallyScrollable = (el: HTMLElement): boolean => {
    const style = getComputedStyle(el);
    const overflowX = style.overflowX;
    return (
      (overflowX === "auto" || overflowX === "scroll") &&
      el.scrollWidth > el.clientWidth
    );
  };

  const canWindowScroll = (): boolean => {
    return document.documentElement.scrollHeight > window.innerHeight;
  };

  const findScrollableParent = (
    el: HTMLElement | null,
  ): {
    element: HTMLElement | Window;
    direction: "vertical" | "horizontal";
  } | null => {
    while (el) {
      if (isHorizontallyScrollable(el)) {
        return { element: el, direction: "horizontal" };
      }
      if (isVerticallyScrollable(el)) {
        return { element: el, direction: "vertical" };
      }
      el = el.parentElement;
    }
    if (canWindowScroll()) {
      return { element: window, direction: "vertical" };
    }
    return null;
  };

  const onMouseDown = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button, a, input, textarea, [role="button"], [onclick]')
    ) {
      return;
    }

    const scrollable = findScrollableParent(target);
    if (!scrollable) return;

    isDragging = true;
    hasDragged = false;
    currentTarget = scrollable.element;
    scrollDirection = scrollable.direction;
    startX = e.clientX;
    startY = e.clientY;

    if (scrollable.element === window) {
      scrollLeft = window.scrollX;
      scrollTop = window.scrollY;
    } else {
      const el = scrollable.element as HTMLElement;
      scrollLeft = el.scrollLeft;
      scrollTop = el.scrollTop;
      el.style.cursor = "grabbing";
    }
    document.body.style.cursor = "grabbing";
  };

  const onMouseMove = (e: MouseEvent): void => {
    if (!isDragging || !currentTarget || !scrollDirection) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (scrollDirection === "horizontal" && Math.abs(dx) > dragThreshold) {
      hasDragged = true;
      e.preventDefault();
      if (currentTarget === window) {
        window.scrollTo(scrollLeft - dx, window.scrollY);
      } else {
        (currentTarget as HTMLElement).scrollLeft = scrollLeft - dx;
      }
    } else if (scrollDirection === "vertical" && Math.abs(dy) > dragThreshold) {
      hasDragged = true;
      e.preventDefault();
      if (currentTarget === window) {
        window.scrollTo(window.scrollX, scrollTop - dy);
      } else {
        (currentTarget as HTMLElement).scrollTop = scrollTop - dy;
      }
    }
  };

  const onMouseUp = (): void => {
    if (currentTarget && currentTarget !== window) {
      (currentTarget as HTMLElement).style.cursor = "";
    }
    document.body.style.cursor = "";
    isDragging = false;
    currentTarget = null;
    scrollDirection = null;
  };

  const onMouseLeave = (): void => {
    if (isDragging) {
      onMouseUp();
    }
  };

  const onClick = (e: MouseEvent): void => {
    if (hasDragged) {
      e.preventDefault();
      e.stopPropagation();
      hasDragged = false;
    }
  };

  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("mouseleave", onMouseLeave);
  document.addEventListener("click", onClick, true);

  return () => {
    document.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("mouseleave", onMouseLeave);
    document.removeEventListener("click", onClick, true);
  };
}

export function initContentProtection(): () => void {
  const cleanupFunctions: Array<() => void> = [];

  cleanupFunctions.push(preventImageDownload());
  cleanupFunctions.push(blockDevTools());
  cleanupFunctions.push(preventTextSelection());
  cleanupFunctions.push(enableDragToScroll());

  return () => {
    for (const fn of cleanupFunctions) {
      fn();
    }
  };
}
