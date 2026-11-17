import * as React from "react";
import { cn } from "../../lib/utils";
import { Loader, CheckCircle2, AlertCircle, Clock, XCircle } from "lucide-react";

export interface ProgressStep {
  label: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  duration?: number; // milliseconds for cadence hint
  detail?: string;
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
  currentStep?: number;
  elapsedTime?: number; // seconds
  showElapsed?: boolean;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
}

export function ProgressIndicator({ 
  steps, 
  currentStep = 0, 
  elapsedTime = 0, 
  showElapsed = true,
  className,
  orientation = 'vertical'
}: ProgressIndicatorProps) {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const getStepStatus = (index: number) => {
    if (index < currentStep) return 'completed';
    if (index === currentStep) return steps[index]?.status || 'active';
    return 'pending';
  };

  const StepIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-verified" />;
      case 'active': return <Loader className="h-4 w-4 animate-spin text-primary" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-danger" />;
      default: return <span className="text-muted-foreground text-xs font-bold" />;
    }
  };

  if (orientation === 'horizontal') {
    return (
      <div className={cn('flex items-center gap-4 overflow-x-auto pb-2', className)}>
        {steps.map((step, index) => {
          const status = getStepStatus(index);
          const isLast = index === steps.length - 1;
          
          return (
            <div key={step.label} className="flex items-center gap-2 min-w-[150px]">
              <div className="flex items-center gap-2">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300">
                  <StepIcon status={status} />
                </div>
                <div className="min-w-0">
                  <span className={cn('block truncate text-sm font-medium', 
                    status === 'completed' ? 'text-foreground line-through decoration-verified/50 decoration-1' : 
                    status === 'active' ? 'text-foreground font-semibold' : 
                    'text-muted-foreground')}>
                    {step.label}
                  </span>
                  {step.duration && status === 'active' && (
                    <span className="text-[10px] text-muted-foreground">~{Math.round(step.duration / 1000)}s</span>
                  )}
                </div>
              </div>
              {!isLast && <span className="flex h-px w-16 bg-border" />}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {steps.map((step, index) => {
        const status = getStepStatus(index);
        const isActive = status === 'active';
        const isCompleted = status === 'completed';
        
        return (
          <div key={step.label} className="relative flex items-start gap-3">
            <div className="relative z-10 flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300">
              <StepIcon status={status} />
            </div>
            <div className="min-w-0 pt-1">
              <span className={cn('block truncate text-sm font-medium',
                isCompleted ? 'text-foreground line-through decoration-verified/50 decoration-1' :
                isActive ? 'text-foreground font-semibold' :
                'text-muted-foreground')}>
                {step.label}
              </span>
              {step.detail && <span className="mt-0.5 text-xs text-muted-foreground">{step.detail}</span>}
              {isActive && showElapsed && (
                <span className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                  <span className="h-1 w-1 rounded-full bg-primary" aria-hidden="true" />
                  {formatTime(elapsedTime)} elapsed
                </span>
              )}
              {isCompleted && <span className="mt-0.5 block text-[10px] text-verified">Complete</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default ProgressIndicator;