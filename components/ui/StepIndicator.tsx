type Step = { label: string };

type StepIndicatorProps = {
  steps: Step[];
  currentStep: number; // 0-based
};

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <div key={step.label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={[
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
                  done
                    ? "bg-brand-gold border-brand-gold text-white"
                    : active
                    ? "bg-brand-gold border-brand-gold text-white"
                    : "bg-white border-slate-300 text-slate-400",
                ].join(" ")}
              >
                {done ? (
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={[
                  "text-xs font-medium whitespace-nowrap",
                  active ? "text-brand-gold" : done ? "text-slate-600" : "text-slate-400",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={[
                  "flex-1 h-0.5 mt-[-14px] mx-1",
                  done ? "bg-brand-gold" : "bg-slate-200",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
