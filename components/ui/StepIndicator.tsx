type Step = { label: string };

type StepIndicatorProps = {
  steps: Step[];
  currentStep: number; // 0-based
  onStepClick?: (step: number) => void;
  canNavigateToStep?: (step: number) => boolean;
};

export function StepIndicator({
  steps,
  currentStep,
  onStepClick,
  canNavigateToStep,
}: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        const canNavigate = Boolean(onStepClick) && (canNavigateToStep?.(i) ?? true);
        const circleClass = [
          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
          canNavigate ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink" : "",
          done || active
            ? "bg-brand-gold border-brand-gold-light text-ink"
            : "bg-black/25 border-white/20 text-cream/50",
        ].join(" ");

        const circleContent = done ? (
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          i + 1
        );

        return (
          <div key={step.label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              {canNavigate ? (
                <button
                  type="button"
                  className={circleClass}
                  onClick={() => onStepClick?.(i)}
                  aria-current={active ? "step" : undefined}
                  aria-label={`Go to ${step.label}`}
                >
                  {circleContent}
                </button>
              ) : (
                <div className={circleClass} aria-current={active ? "step" : undefined}>
                  {circleContent}
                </div>
              )}
              <span
                className={[
                  "text-xs font-medium whitespace-nowrap",
                  active ? "text-brand-gold-light" : done ? "text-cream/70" : "text-cream/40",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={[
                  "flex-1 h-0.5 mt-[-14px] mx-1",
                  done ? "bg-brand-gold" : "bg-white/15",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
