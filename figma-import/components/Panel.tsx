import { ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}

export function Panel({ children, className = "", title, action }: PanelProps) {
  return (
    <div className={`bg-panel border border-border rounded-lg shadow-lg ${className}`}>
      {title && (
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {action}
        </div>
      )}
      <div className={title ? "p-4 h-[calc(100%-49px)]" : ""}>{children}</div>
    </div>
  );
}