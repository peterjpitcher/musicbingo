"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { helpClass, inputClass, labelClass } from "@/components/ui/formStyles";

type StepEventSetupProps = {
  eventDate: string;
  onEventDate: (v: string) => void;
  countInput: string;
  onCountInput: (v: string) => void;
  sessionName: string;
  onSessionName: (v: string) => void;
  onNext: () => void;
};

export function StepEventSetup({
  eventDate,
  onEventDate,
  countInput,
  onCountInput,
  sessionName,
  onSessionName,
  onNext,
}: StepEventSetupProps) {
  const count = Number.parseInt(countInput, 10);
  const canNext =
    eventDate.trim() !== "" &&
    Number.isFinite(count) &&
    count >= 1 &&
    count <= 1000;

  return (
    <Card>
      <h2 className="text-xl font-bold text-slate-800 mb-6">Event Setup</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
        <div>
          <label className={labelClass}>Event Date</label>
          <input
            type="date"
            className={inputClass}
            value={eventDate}
            onChange={(e) => onEventDate(e.target.value)}
          />
          <p className={helpClass}>Used in PDFs, DOCX clipboard, and playlist names</p>
        </div>
        <div>
          <label className={labelClass}>Cards Per Game</label>
          <input
            type="number"
            className={inputClass}
            min={1}
            max={1000}
            value={countInput}
            onChange={(e) => onCountInput(e.target.value)}
          />
          <p className={helpClass}>Default is 40</p>
        </div>
      </div>
      <div className="mb-6">
        <label className={labelClass}>Session Name</label>
        <input
          type="text"
          className={inputClass}
          value={sessionName}
          onChange={(e) => onSessionName(e.target.value)}
          placeholder="Music Bingo - Event Date"
        />
        <p className={helpClass}>Used to identify this session in the live host console</p>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={onNext} disabled={!canNext}>
          Next: Game 1 →
        </Button>
      </div>
    </Card>
  );
}
