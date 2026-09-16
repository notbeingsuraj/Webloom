import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="wl-eyebrow">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-3xl font-bold tracking-[-0.04em] text-foreground md:text-[2.6rem]">{title}</h1>
        {description ? <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
