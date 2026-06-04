/**
 * Accessibility utilities and helpers
 * WCAG 2.1 Level AA compliance support
 */

/**
 * ARIA labels helper
 */
export const createAriaLabel = (
  context: string,
  ...descriptors: string[]
): string => {
  return [context, ...descriptors].filter(Boolean).join(' - ');
};

/**
 * Color contrast checker
 */
export const getContrast = (rgb1: [number, number, number], rgb2: [number, number, number]): number => {
  const getLuminance = (rgb: [number, number, number]) => {
    const [r, g, b] = rgb.map((val) => {
      const v = val / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const l1 = getLuminance(rgb1);
  const l2 = getLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Check if color pair meets WCAG AA standard (4.5:1 for normal text, 3:1 for large text)
 */
export const meetsWCAGContrast = (
  rgb1: [number, number, number],
  rgb2: [number, number, number],
  largeText: boolean = false
): boolean => {
  const contrast = getContrast(rgb1, rgb2);
  const threshold = largeText ? 3 : 4.5;
  return contrast >= threshold;
};

/**
 * Keyboard navigation helpers
 */
export const KeyboardKeys = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  TAB: 'Tab',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
} as const;

/**
 * Check if key press should trigger action (Space or Enter for buttons)
 */
export const isActivationKey = (key: string): boolean => {
  return key === KeyboardKeys.ENTER || key === KeyboardKeys.SPACE;
};

/**
 * Get focusable elements within container
 */
export const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const focusableSelectors = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[role="button"]:not([aria-disabled="true"])',
    '[role="link"]:not([aria-disabled="true"])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll(focusableSelectors));
};

/**
 * Screen reader announcements
 */
export const announceToScreenReader = (message: string, priority: 'polite' | 'assertive' = 'polite'): void => {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

/**
 * Create skip-to-main-content link (should be first element in DOM).
 */
export const createSkipToMainContentLink = (): HTMLAnchorElement => {
  const link = document.createElement('a');
  link.href = '#main-content';
  link.className = 'sr-only focus:not-sr-only absolute top-0 left-0 z-50 bg-blue-600 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white';
  link.textContent = 'Skip to main content';
  return link;
};

/**
 * Responsive text sizing for accessibility
 */
export const getAccessibleFontSize = (baseSize: number, factor: number = 1): number => {
  // Ensure minimum 14px for body text (WCAG recommendation)
  return Math.max(14, baseSize * factor);
};

/**
 * Create accessible data table headers
 */
export const createAccessibleTableHeader = (
  columnName: string,
  isSorted: boolean = false,
  sortDirection?: 'asc' | 'desc'
): string => {
  let label = columnName;
  if (isSorted && sortDirection) {
    label += `, sorted ${sortDirection}ending`;
  }
  return label;
};

/**
 * ARIA live region announcements for tables
 */
export const announceSortChange = (columnName: string, direction: 'asc' | 'desc'): void => {
  const message = `Table sorted by ${columnName}, ${direction === 'asc' ? 'ascending' : 'descending'}`;
  announceToScreenReader(message);
};

/**
 * Announce loading states
 */
export const announceLoading = (context: string): void => {
  announceToScreenReader(`${context} is loading`, 'polite');
};

/**
 * Announce error states
 */
export const announceError = (errorMessage: string): void => {
  announceToScreenReader(`Error: ${errorMessage}`, 'assertive');
};

/**
 * Announce success states
 */
export const announceSuccess = (message: string): void => {
  announceToScreenReader(`Success: ${message}`, 'polite');
};

/**
 * Ensure focus is visible (high contrast outline)
 */
export const ensureVisibleFocus = (element: HTMLElement): void => {
  element.style.outline = '3px solid #2563eb';
  element.style.outlineOffset = '2px';
};

/**
 * Create accessible icon button with text
 */
export interface AccessibleIconButtonProps {
  icon: React.ReactNode;
  label: string;
  ariaLabel?: string;
  onClick: () => void;
}

/**
 * Validate form input with accessibility
 */
export const validateFormInput = (
  input: HTMLInputElement,
  isValid: boolean,
  errorMessage?: string
): void => {
  if (!isValid) {
    input.setAttribute('aria-invalid', 'true');
    if (errorMessage) {
      input.setAttribute('aria-describedby', `${input.id}-error`);
      const errorElement = document.getElementById(`${input.id}-error`);
      if (errorElement) {
        errorElement.textContent = errorMessage;
      }
      announceError(errorMessage);
    }
  } else {
    input.setAttribute('aria-invalid', 'false');
    input.removeAttribute('aria-describedby');
  }
};
