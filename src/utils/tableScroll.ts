// Table scroll synchronization helper
// Synchronizes horizontal scroll between table and top scrollbar

export function initializeTableScroll(): void {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTableScrollSync);
  } else {
    setupTableScrollSync();
  }
}

function setupTableScrollSync(): void {
  // Find all table wrappers with scroll synchronization
  const tableWrappers = document.querySelectorAll('[data-table-scroll]');

  tableWrappers.forEach((wrapper) => {
    const scrollTop = wrapper.querySelector('.table-scroll-top') as HTMLElement;
    const scrollContent = wrapper.querySelector('.table-scroll-content') as HTMLElement;

    if (!scrollTop || !scrollContent) return;

    // Sync: scroll top → scroll content
    scrollTop.addEventListener('scroll', () => {
      scrollContent.scrollLeft = scrollTop.scrollLeft;
    });

    // Sync: scroll content → scroll top
    scrollContent.addEventListener('scroll', () => {
      scrollTop.scrollLeft = scrollContent.scrollLeft;
    });

    // Initialize dummy scrollbar width
    initializeScrollbarWidth(scrollTop, scrollContent);
  });
}

function initializeScrollbarWidth(
  scrollTop: HTMLElement,
  scrollContent: HTMLElement
): void {
  // Create a dummy element to match the scrollbar width
  setTimeout(() => {
    const contentScrollWidth = scrollContent.scrollWidth;
    const contentClientWidth = scrollContent.clientWidth;

    if (contentScrollWidth > contentClientWidth) {
      // Create invisible dummy content for scrollbar
      let dummy = scrollTop.querySelector('[data-dummy]') as HTMLElement;
      if (!dummy) {
        dummy = document.createElement('div');
        dummy.setAttribute('data-dummy', 'true');
        dummy.style.height = '1px';
        dummy.style.width = contentScrollWidth + 'px';
        scrollTop.appendChild(dummy);
      } else {
        dummy.style.width = contentScrollWidth + 'px';
      }
    }
  }, 0);

  // Watch for content changes and update dummy width
  const observer = new ResizeObserver(() => {
    const contentScrollWidth = scrollContent.scrollWidth;
    const dummy = scrollTop.querySelector('[data-dummy]') as HTMLElement;
    if (dummy) {
      dummy.style.width = contentScrollWidth + 'px';
    }
  });

  observer.observe(scrollContent);
}

// Auto-initialize on import
initializeTableScroll();
