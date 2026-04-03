"use client";

import type { ReactNode } from "react";
import BrandWordmark from "@/components/BrandWordmark";
import styles from "./MedScanChrome.module.css";

type ChromeNavLink = {
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
};

type ChromeTopBarItem = {
  label: string;
  icon?: ReactNode;
  live?: boolean;
};

type ChromeAction = {
  label: string;
  variant: "outline" | "solid" | "icon";
  onClick: () => void;
  icon?: ReactNode;
  ariaLabel?: string;
  title?: string;
  mobileOnly?: boolean;
};

type Props = {
  dark: boolean;
  statusLabel: string;
  onToggleTheme: () => void;
  onBrandClick?: () => void;
  topBarItems?: ChromeTopBarItem[];
  topBarBadge?: string;
  navLinks?: ChromeNavLink[];
  secondaryAction?: ChromeAction;
  primaryAction?: ChromeAction;
  iconAction?: ChromeAction;
  hideStatusOnMobile?: boolean;
  children: ReactNode;
};

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function ActionButton({ action }: { action: ChromeAction }) {
  if (action.variant === "icon") {
    return (
      <button
        type="button"
        className={joinClassNames(styles.actionIcon, action.mobileOnly ? styles.mobileOnly : undefined)}
        onClick={action.onClick}
        aria-label={action.ariaLabel || action.label}
        title={action.title || action.label}
      >
        {action.icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={joinClassNames(
        styles.actionBtn,
        action.mobileOnly ? styles.mobileOnly : undefined,
        action.variant === "solid" ? styles.actionSolid : styles.actionOutline
      )}
      onClick={action.onClick}
    >
      {action.label}
    </button>
  );
}

export default function MedScanChrome({
  dark,
  statusLabel,
  onToggleTheme,
  onBrandClick,
  topBarItems = [],
  topBarBadge,
  navLinks = [],
  secondaryAction,
  primaryAction,
  iconAction,
  hideStatusOnMobile = false,
  children,
}: Props) {
  const showTopBar = topBarItems.length > 0 || Boolean(topBarBadge);

  return (
    <div className={styles.scope}>
      <div className={styles.bgGrid} />

      {showTopBar ? (
        <div className={styles.topBar}>
          <div className={styles.topBarLeft}>
            {topBarItems.map((item) => (
              <div key={item.label} className={styles.topBarItem}>
                {item.live ? (
                  <span className={styles.liveDot} aria-hidden="true" />
                ) : item.icon ? (
                  <span className={styles.topBarIcon}>{item.icon}</span>
                ) : null}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          {topBarBadge ? <span className={styles.topBarBadge}>{topBarBadge}</span> : null}
        </div>
      ) : null}

      <nav className={styles.nav}>
        <button type="button" className={styles.brand} onClick={onBrandClick} aria-label="Go to MedScan home">
          <span className={styles.brandMark}>🩺</span>
          <BrandWordmark />
        </button>

        {navLinks.length > 0 ? (
          <ul className={styles.links}>
            {navLinks.map((link) => (
              <li key={link.label}>
                {link.onClick ? (
                  <button
                    type="button"
                    className={joinClassNames(styles.linkBtn, link.active ? styles.linkActive : undefined)}
                    onClick={link.onClick}
                  >
                    {link.label}
                  </button>
                ) : (
                  <a
                    href={link.href}
                    className={joinClassNames(styles.linkAnchor, link.active ? styles.linkActive : undefined)}
                  >
                    {link.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <div className={styles.right}>
          <span className={styles.statusPill} data-hide-mobile={hideStatusOnMobile ? "true" : "false"}>
            <span className={styles.pulseDot} />
            {statusLabel}
          </span>
          {secondaryAction ? <ActionButton action={secondaryAction} /> : null}
          {primaryAction ? <ActionButton action={primaryAction} /> : null}
          {iconAction ? <ActionButton action={iconAction} /> : null}
          <button
            type="button"
            className={styles.themeToggle}
            onClick={onToggleTheme}
            title="Toggle theme"
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {dark ? "☀️" : "🌙"}
          </button>
        </div>
      </nav>

      <div className={styles.body}>{children}</div>
    </div>
  );
}
