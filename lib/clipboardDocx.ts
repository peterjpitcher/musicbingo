import { Document, Packer, Paragraph, TextRun } from "docx";

import { formatEventDateWithWeekdayDisplay } from "@/lib/eventDate";
import { normalizeGameTheme } from "@/lib/gameInput";
import type { Song } from "@/lib/types";

type ClipboardGame = {
  theme: string;
  songs: Song[];
  challengeSong: Song;
};

type RenderClipboardDocxParams = {
  eventDateInput: string;
  game1: ClipboardGame;
  game2: ClipboardGame;
};

function songLabel(song: Song): string {
  return `${song.artist} - ${song.title}`;
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

export async function renderClipboardDocx(params: RenderClipboardDocxParams): Promise<Uint8Array> {
  const eventDate = formatEventDateWithWeekdayDisplay(params.eventDateInput) || params.eventDateInput;
  const game1Theme = normalizeGameTheme(params.game1.theme);
  const game2Theme = normalizeGameTheme(params.game2.theme);
  const game1ChallengeSong = songLabel(params.game1.challengeSong);
  const game2ChallengeSong = songLabel(params.game2.challengeSong);

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
        new TextRun({ text: "7:00 pm - 9:30 pm" }),
      ],
      spacing: { after: 200 },
    }),

    heading("OPENING REMARKS"),
    bullet("Brief introduction of tonight's game, Music Bingo."),
    bullet("Tonight's tagline: A night of music fun."),
    bullet("We'll be playing two separate Music Bingo games (two different song lists)."),
    bullet("Song pace: aim for 20 seconds per song (unless there is big audience participation). Goal is speed."),
    bullet("Each Music Bingo game is capped at 50 songs (about 16 minutes 20 seconds of constant play, plus Nikki banter)."),
    bullet("KaraFun points (mobile quiz):"),
    subBullet("1st place 30 pts"),
    subBullet("2nd place 20 pts"),
    subBullet("3rd place 10 pts"),
    bullet("Music Bingo points: The first person to call gets the points, so be quick."),
    subBullet("1 line 15 pts"),
    subBullet("2 lines 25 pts"),
    subBullet("Full House 50 pts"),
    bullet("Reminder: The kitchen is open until 9 pm for food orders."),

    heading("SCHEDULE"),
    numbered("1. Welcome - Yes Sir (Nikki lip sync)"),
    numbered("2. Announcements"),
    numbered("3. KaraFun mobile quiz (Round 1)"),
    numbered("4. Music Bingo Game 1 (50 songs max)"),
    numbered("5. Break (10 mins)"),
    numbered("6. KaraFun mobile quiz (Round 2)"),
    numbered("7. Music Bingo Game 2 (50 songs max, different song list)"),
    numbered("8. Announcements"),
    numbered("9. Sing Along/Out - end-of-night singalong"),

    heading("UPCOMING EVENTS"),
    bullet("** Update this section before printing — add the next 3–4 upcoming events with dates, times, and short descriptions. **"),

    heading("BONUS FUN"),
    bullet("Dancing Challenge (20 pts) - placed in Game 1."),
    subBullet(`Song: ${game1ChallengeSong}`),
    subBullet("Nikki announces the song in advance. Anyone who wants to can get up and dance along. Nikki picks a winner and awards 20 bonus points."),
    bullet("Sing-Along Challenge (20 pts) - placed in Game 2."),
    subBullet(`Song: ${game2ChallengeSong}`),
    subBullet("Nikki announces the song in advance. Everyone can play. Last person singing the right words wins. If you sing the wrong words, you sit down. Winner gets 20 bonus points."),

    heading("MUSIC BINGO"),
    bullet("IMPORTANT: Create two separate games for next time (Game 1 list and Game 2 list). Do not reuse the same pool for both."),
    bullet("Max 50 songs per game."),
    bullet("20 seconds per song unless audience participation is high."),

    heading(`MUSIC BINGO GAME 1 (${game1Theme})`),
    ...songsBlock(params.game1.songs),

    blankLine(),
    heading(`MUSIC BINGO GAME 2 (${game2Theme})`),
    ...songsBlock(params.game2.songs),
  ];

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
