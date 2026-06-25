// The single shared inline error / empty / info primitive — design.md D4,
// NFR-OBS-01. EVERY capability renders this instead of a generic 500 page or a
// silently blank region. It renders inline within its region, draws calm copy
// from the centralized string layer (no exclamation marks, BC-BRAND-01), and is
// announced to assistive technology with an accessible name (NFR-A11Y-01):
// `role="alert"` for errors (assertive), `role="status"` for empty/info (polite).
import { Inbox, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type NoticeVariant = "error" | "empty" | "info";

type NoticeProps = {
  variant: NoticeVariant;
  /** Override the default i18n title (e.g. a capability-specific message). */
  title?: string;
  /** Override the default i18n description. */
  description?: string;
  /** Optional inline action (e.g. a retry control). */
  action?: React.ReactNode;
  className?: string;
};

type VariantConfig = {
  role: "alert" | "status";
  icon: LucideIcon;
  titleKey: "shell.notice.error.title" | "shell.notice.empty.title" | "shell.notice.info.title";
  descriptionKey:
    | "shell.notice.error.description"
    | "shell.notice.empty.description"
    | "shell.notice.info.description";
  iconClass: string;
};

const VARIANTS: Record<NoticeVariant, VariantConfig> = {
  error: {
    role: "alert",
    icon: TriangleAlert,
    titleKey: "shell.notice.error.title",
    descriptionKey: "shell.notice.error.description",
    iconClass: "text-primary",
  },
  empty: {
    role: "status",
    icon: Inbox,
    titleKey: "shell.notice.empty.title",
    descriptionKey: "shell.notice.empty.description",
    iconClass: "text-muted-foreground",
  },
  info: {
    role: "status",
    icon: Info,
    titleKey: "shell.notice.info.title",
    descriptionKey: "shell.notice.info.description",
    iconClass: "text-accent",
  },
};

export function Notice({
  variant,
  title,
  description,
  action,
  className,
}: NoticeProps) {
  const config = VARIANTS[variant];
  const Icon = config.icon;
  const resolvedTitle = title ?? t(config.titleKey);
  const resolvedDescription = description ?? t(config.descriptionKey);

  return (
    <div
      role={config.role}
      // The title doubles as the container's accessible name so assistive tech
      // announces a meaningful label, not just the raw role.
      aria-label={resolvedTitle}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-6 py-5 text-center",
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn("size-6 shrink-0", config.iconClass)} />
      <p className="text-base font-medium text-foreground text-balance">
        {resolvedTitle}
      </p>
      {resolvedDescription ? (
        <p className="max-w-prose text-sm text-muted-foreground text-balance">
          {resolvedDescription}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
