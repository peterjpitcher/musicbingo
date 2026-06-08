"use client";

import { useMemo, useState } from "react";
import type { LiveTeamScore } from "@/lib/live/types";

export type AwardPreset = {
  label: string;
  points: number;
};

type AwardPointsModalProps = {
  open: boolean;
  teams: LiveTeamScore[];
  presets: AwardPreset[];
  onClose: () => void;
  onAddTeam: (name: string) => void;
  onRemoveTeam: (teamId: string) => void;
  onAward: (team: LiveTeamScore, points: number, label: string) => void;
};

export function AwardPointsModal({
  open,
  teams,
  presets,
  onClose,
  onAddTeam,
  onRemoveTeam,
  onAward,
}: AwardPointsModalProps): JSX.Element | null {
  const [teamName, setTeamName] = useState("");
  const [bonusInputsByTeam, setBonusInputsByTeam] = useState<Record<string, string>>({});
  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams]
  );

  if (!open) return null;

  function submitTeam(): void {
    const name = teamName.trim();
    if (!name) return;
    onAddTeam(name);
    setTeamName("");
  }

  return (
    <div className="score-modal-backdrop" role="dialog" aria-modal="true" aria-label="Award points">
      <div className="score-modal">
        <div className="score-modal-head">
          <div>
            <h2>Award Points</h2>
            <p>Add teams, then tap the correct award for the team that won it.</p>
          </div>
          <button type="button" className="hbtn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="score-add-row">
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitTeam();
            }}
            placeholder="Team name"
          />
          <button type="button" className="hbtn hbtn--primary" onClick={submitTeam}>
            Add Team
          </button>
        </div>

        {sortedTeams.length === 0 ? (
          <div className="score-empty">
            Add team names before the first quiz or as players arrive.
          </div>
        ) : (
          <div className="score-team-list">
            {sortedTeams.map((team) => (
              <TeamScoreRow
                key={team.id}
                team={team}
                presets={presets}
                bonusInput={bonusInputsByTeam[team.id] ?? "10"}
                onBonusInput={(value) =>
                  setBonusInputsByTeam((prev) => ({ ...prev, [team.id]: value }))
                }
                onAward={onAward}
                onRemoveTeam={onRemoveTeam}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamScoreRow({
  team,
  presets,
  bonusInput,
  onBonusInput,
  onAward,
  onRemoveTeam,
}: {
  team: LiveTeamScore;
  presets: AwardPreset[];
  bonusInput: string;
  onBonusInput: (value: string) => void;
  onAward: (team: LiveTeamScore, points: number, label: string) => void;
  onRemoveTeam: (teamId: string) => void;
}): JSX.Element {
  const bonusPoints = Number.parseInt(bonusInput, 10);
  const canAwardBonus = Number.isFinite(bonusPoints) && bonusPoints > 0;

  return (
    <div className="score-team-row">
      <div className="score-team-main">
        <div className="score-team-name">{team.name}</div>
        <div className="score-team-total">{team.score} pts</div>
      </div>
      <div className="score-actions">
        {presets.map((preset) => (
          <button
            type="button"
            className="hbtn hbtn--primary"
            key={`${team.id}-${preset.label}`}
            onClick={() => onAward(team, preset.points, preset.label)}
          >
            {preset.label} +{preset.points}
          </button>
        ))}
        <input
          className="score-team-bonus"
          type="number"
          min={1}
          step={1}
          value={bonusInput}
          onChange={(e) => onBonusInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canAwardBonus) {
              onAward(team, bonusPoints, "Bonus");
            }
          }}
          aria-label={`Bonus points for ${team.name}`}
        />
        <button
          type="button"
          className="hbtn hbtn--go"
          disabled={!canAwardBonus}
          onClick={() => onAward(team, bonusPoints, "Bonus")}
        >
          Bonus +{canAwardBonus ? bonusPoints : 0}
        </button>
        <button
          type="button"
          className="hbtn"
          onClick={() => onRemoveTeam(team.id)}
          title={`Remove ${team.name}`}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
