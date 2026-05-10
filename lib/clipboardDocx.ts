import { Document, Packer, Paragraph, TextRun } from "docx";

import { formatEventDateWithWeekdayDisplay } from "@/lib/eventDate";
import { normalizeGameTheme } from "@/lib/gameInput";
import type { EventDetail } from "@/lib/managementApi";
import type { Song } from "@/lib/types";

type IntroSongEntry = {
  type: string;
  artist: string;
  title: string;
};

type ClipboardGame = {
  theme: string;
  songs: Song[];
  challengeSongs: Song[];
  introSong?: Song;
  challengeTypes?: string[];
  introSongs?: IntroSongEntry[];
};

type RenderClipboardDocxParams = {
  eventDateInput: string;
  game1: ClipboardGame;
  game2: ClipboardGame;
  upcomingEvents?: EventDetail[];
};

function songLabel(song: Song): string {
  return `${song.artist} - ${song.title}`;
}

function challengeTypeLabel(type: string): string {
  switch (type) {
    case "dance-along":
      return "DANCE ALONG";
    case "sing-along":
      return "SING ALONG";
    default:
      return type.toUpperCase();
  }
}

function blankLine(): Paragraph {
  return new Paragraph({ text: "" });
}

function heading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true })],
    spacing: { before: 180, after: 100 },
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    text: `- ${text}`,
    spacing: { after: 80 },
  });
}

function subBullet(text: string): Paragraph {
  return new Paragraph({
    text: `  o ${text}`,
    spacing: { after: 60 },
  });
}

function numbered(text: string): Paragraph {
  return new Paragraph({
    text,
    spacing: { after: 80 },
  });
}

function songsBlock(songs: Song[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i] as Song;
    out.push(numbered(`${i + 1}. ${songLabel(song)}`));
  }
  return out;
}

function eventParagraphs(events?: EventDetail[]): Paragraph[] {
  if (!events || events.length === 0) {
    return [
      bullet("** Update this section before printing — add the next 3–4 upcoming events with dates, times, and short descriptions. **"),
    ];
  }
  return events.map(
    (evt) =>
      new Paragraph({
        bullet: { level: 0 },
        children: [
          new TextRun({ text: `${evt.name} — ${evt.dateFormatted}: `, bold: true }),
          new TextRun({ text: evt.description }),
        ],
        spacing: { after: 80 },
      }),
  );
}

export async function renderClipboardDocx(params: RenderClipboardDocxParams): Promise<Uint8Array> {
  const eventDate = formatEventDateWithWeekdayDisplay(params.eventDateInput) || params.eventDateInput;
  const game1Theme = normalizeGameTheme(params.game1.theme);
  const game2Theme = normalizeGameTheme(params.game2.theme);
  const game1IntroLabel = params.game1.introSong ? songLabel(params.game1.introSong) : null;
  const game2IntroLabel = params.game2.introSong ? songLabel(params.game2.introSong) : null;

  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: "EVENT CLIPBOARD", bold: true, size: 32 })],
      spacing: { after: 220 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Date: ", bold: true }),
        new TextRun({ text: eventDate }),
        new TextRun({ text: "    Time: ", bold: true }),
        new TextRun({ text: "8:00 pm - 12:00 am" }),
      ],
      spacing: { after: 200 },
    }),

    heading("OPENING REMARKS"),
    bullet("We'll be playing two separate Music Bingo games (two different song lists)."),
    bullet("Song pace: aim for 60 seconds per song (unless there is big audience participation). Goal is speed."),
    bullet("Each Music Bingo game is capped at 50 songs (about 33 minutes 20 seconds of constant play, plus Nikki banter)."),
    bullet("KaraFun points (mobile quiz):"),
    subBullet("1st place 30 pts"),
    subBullet("2nd place 20 pts"),
    subBullet("3rd place 10 pts"),
    bullet("Music Bingo points: The first person to call gets the points, so be quick."),
    subBullet("1 line 15 pts"),
    subBullet("2 lines 25 pts"),
    subBullet("Full House 50 pts"),
    bullet("Reminder: The kitchen is open until 9 pm for food orders."),
  ];

  // Build schedule with dynamic numbering for intro song slots
  children.push(heading("SCHEDULE"));
  let n = 1;
  children.push(numbered(`${n++}. Welcome - Yes Sir (Nikki lip sync)`));
  children.push(numbered(`${n++}. Announcements`));
  children.push(numbered(`${n++}. KaraFun mobile quiz (Round 1)`));
  children.push(numbered(`${n++}. Dance Along intro${game1IntroLabel ? ` — ${game1IntroLabel}` : " (TBD)"}`));
  children.push(numbered(`${n++}. Music Bingo Game 1 (50 songs max)`));
  children.push(numbered(`${n++}. Break (10 mins)`));
  children.push(numbered(`${n++}. KaraFun mobile quiz (Round 2)`));
  children.push(numbered(`${n++}. Sing Along intro${game2IntroLabel ? ` — ${game2IntroLabel}` : " (TBD)"}`));
  children.push(numbered(`${n++}. Music Bingo Game 2 (50 songs max, different song list)`));
  children.push(numbered(`${n++}. Announcements`));

  children.push(heading("UPCOMING EVENTS"));
  children.push(...eventParagraphs(params.upcomingEvents));

  children.push(heading("BONUS FUN"));

  if (params.game1.introSongs && params.game1.introSongs.length > 0) {
    children.push(bullet("Game 1 Intro Songs:"));
    for (const intro of params.game1.introSongs) {
      children.push(subBullet(`${challengeTypeLabel(intro.type)}: ${intro.artist} - ${intro.title}`));
    }
  } else if (game1IntroLabel) {
    children.push(bullet(`Dance Along intro: ${game1IntroLabel}`));
  }

  children.push(bullet("Dancing Challenge (20 pts) - placed in Game 1."));
  const g1Types = params.game1.challengeTypes ?? [];
  for (let i = 0; i < params.game1.challengeSongs.length; i++) {
    const typePrefix = g1Types[i] ? `${challengeTypeLabel(g1Types[i])}: ` : "";
    children.push(subBullet(`Song ${i + 1}: ${typePrefix}${songLabel(params.game1.challengeSongs[i]!)}`));
  }
  children.push(subBullet("Nikki announces the song in advance. Anyone who wants to can get up and dance along. Nikki picks a winner and awards 20 bonus points."));

  if (params.game2.introSongs && params.game2.introSongs.length > 0) {
    children.push(bullet("Game 2 Intro Songs:"));
    for (const intro of params.game2.introSongs) {
      children.push(subBullet(`${challengeTypeLabel(intro.type)}: ${intro.artist} - ${intro.title}`));
    }
  } else if (game2IntroLabel) {
    children.push(bullet(`Sing Along intro: ${game2IntroLabel}`));
  }

  children.push(bullet("Sing-Along Challenge (20 pts) - placed in Game 2."));
  const g2Types = params.game2.challengeTypes ?? [];
  for (let i = 0; i < params.game2.challengeSongs.length; i++) {
    const typePrefix = g2Types[i] ? `${challengeTypeLabel(g2Types[i])}: ` : "";
    children.push(subBullet(`Song ${i + 1}: ${typePrefix}${songLabel(params.game2.challengeSongs[i]!)}`));
  }
  children.push(subBullet("Nikki announces the song in advance. Everyone can play. Last person singing the right words wins. If you sing the wrong words, you sit down. Winner gets 20 bonus points."));

  children.push(heading("MUSIC BINGO"));
  children.push(bullet("IMPORTANT: Create two separate games for next time (Game 1 list and Game 2 list). Do not reuse the same pool for both."));
  children.push(bullet("Max 50 songs per game."));
  children.push(bullet("60 seconds per song unless audience participation is high."));

  children.push(heading(`MUSIC BINGO GAME 1 (${game1Theme})`));
  children.push(...songsBlock(params.game1.songs));

  children.push(blankLine());
  children.push(heading(`MUSIC BINGO GAME 2 (${game2Theme})`));
  children.push(...songsBlock(params.game2.songs));

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return new Uint8Array(await Packer.toBuffer(doc));
}
