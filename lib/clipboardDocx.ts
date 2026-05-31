import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

import { formatEventDateWithWeekdayDisplay } from "@/lib/eventDate";
import { normalizeGameTheme } from "@/lib/gameInput";
import { DEFAULT_REVEAL_CONFIG } from "@/lib/live/types";
import type { NormalisedEvent } from "@/lib/eventFeed";
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
  upcomingEvents?: NormalisedEvent[];
  normalSongSeconds?: number;
};

// ─── Print-safe greyscale palette ───────────────────────────────────────────
// Matches the run sheet PDF (pure greyscale, B&W-printer safe). No brand colour
// is introduced here so a host can print the clipboard on any office printer.
const FONT = "Calibri";
const INK = "1A1A1A"; // near-black — headings and emphasis
const BODY = "262626"; // body text
const MUTE = "595959"; // secondary text, scripted lines, footer
const RULE = "BFBFBF"; // hairline rules and quote bars

const BULLETS_REF = "clipboard-bullets";
const SCHEDULE_REF = "clipboard-schedule";

type RunContent = string | TextRun[];

function toRuns(content: RunContent): TextRun[] {
  return typeof content === "string" ? [new TextRun(content)] : content;
}

function songLabel(song: Song): string {
  return `${song.artist} — ${song.title}`;
}

function challengeTypeLabel(type: string): string {
  switch (type) {
    case "dance-along":
      return "Dance Along";
    case "sing-along":
      return "Sing Along";
    default:
      return type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function spacer(): Paragraph {
  return new Paragraph({ text: "", spacing: { after: 80 } });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, text });
}

function bullet(content: RunContent): Paragraph {
  return new Paragraph({
    children: toRuns(content),
    numbering: { reference: BULLETS_REF, level: 0 },
    spacing: { after: 80 },
  });
}

function subBullet(content: RunContent): Paragraph {
  return new Paragraph({
    children: toRuns(content),
    numbering: { reference: BULLETS_REF, level: 1 },
    spacing: { after: 60 },
  });
}

function scheduleItem(text: string): Paragraph {
  return new Paragraph({
    text,
    numbering: { reference: SCHEDULE_REF, level: 0 },
    spacing: { after: 80 },
  });
}

// Scripted lines for Nikki — set apart with a left rule and muted italics so the
// host can scan "what to say" at a glance.
function scriptLine(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, italics: true, color: MUTE })],
    indent: { left: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: RULE, space: 12 } },
    spacing: { after: 100 },
  });
}

function eventParagraphs(events?: NormalisedEvent[]): Paragraph[] {
  if (!events || events.length === 0) {
    return [
      bullet(
        "Update this section before printing — add the next 3–4 upcoming events with dates, times, and short descriptions.",
      ),
    ];
  }
  return events.map((evt) =>
    bullet([
      new TextRun({ text: `${evt.name} — ${evt.dateFormatted}: `, bold: true, color: INK }),
      new TextRun({ text: evt.description, color: BODY }),
    ]),
  );
}

export async function renderClipboardDocx(params: RenderClipboardDocxParams): Promise<Uint8Array> {
  const eventDate = formatEventDateWithWeekdayDisplay(params.eventDateInput) || params.eventDateInput;
  const game1Theme = normalizeGameTheme(params.game1.theme);
  const game2Theme = normalizeGameTheme(params.game2.theme);
  const normalSongSeconds = Number.isFinite(params.normalSongSeconds)
    ? Math.max(1, Math.round(params.normalSongSeconds as number))
    : Math.floor(DEFAULT_REVEAL_CONFIG.nextMs / 1000);

  const children: Paragraph[] = [
    // ─── TITLE BLOCK ───
    new Paragraph({
      children: [
        new TextRun({ text: "EVENT CLIPBOARD", bold: true, size: 18, color: MUTE, characterSpacing: 24 }),
      ],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Music Bingo with Nikki", bold: true, size: 40, color: INK })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Date   ", bold: true, color: MUTE }),
        new TextRun({ text: eventDate, color: BODY }),
        new TextRun({ text: "        Time   ", bold: true, color: MUTE }),
        new TextRun({ text: "8:00 pm – 12:00 am", color: BODY }),
      ],
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 10 } },
      spacing: { after: 280 },
    }),

    // ─── CORE IDEA ───
    sectionHeading("CORE IDEA FOR THE NIGHT"),
    bullet("Music bingo is a party with a game running through it. The music comes first, but the bingo gives the night structure."),
    bullet("People should listen enough to mark their cards, then sing, laugh, dance in their seats and get involved."),
    bullet("Nikki should create two clear modes: PLAY MODE for listening and marking cards, and PARTY MODE for card-down moments."),
    bullet("The aim is not quiet bingo. The aim is a high-energy, interactive music night where the room feels involved from start to finish."),

    // ─── OPENING REMARKS ───
    sectionHeading("OPENING REMARKS — WHAT NIKKI SAYS AT THE START"),
    scriptLine("Opening line: \"Welcome to Music Bingo at The Anchor. This is not quiet bingo. This is a party with a game running through it, so sing along, dance in your seats, get involved and make some noise.\""),
    scriptLine("How to play: \"You will hear a clip of a song. If that song is on your card, mark it off. When you get 1 line, 2 lines or a full house, shout loudly and quickly. First person to call gets the points, so do not be shy.\""),
    scriptLine("Energy rule: \"Most songs will be quick so the game keeps moving, but when I call CARD DOWN, EYES UP, the game pauses for a big singalong, dance moment or room challenge. That means you are not missing anything on your card.\""),
    scriptLine("Card-down call-and-response: \"When I say Cards down, you say Eyes up. Cards down?\""),
    scriptLine("Kitchen reminder: \"Quick reminder - the kitchen is open until 9 pm, so get your food orders in early.\""),

    // ─── GAME RULES AND POINTS ───
    sectionHeading("GAME RULES AND POINTS"),
    bullet("We will play two separate Music Bingo games using two different song lists."),
    bullet(`Song pace: aim for around ${normalSongSeconds} seconds per song. Keep it moving unless there is big audience participation.`),
    bullet("Each Music Bingo game is capped at 50 songs."),
    bullet("Music Bingo points: first person to call gets the points."),
    subBullet("1 line = 15 pts"),
    subBullet("2 lines = 25 pts"),
    subBullet("Full house = 50 pts"),
    bullet("KaraFun mobile quiz points:"),
    subBullet("1st place 30 pts"),
    subBullet("2nd place 20 pts"),
    subBullet("3rd place 10 pts"),
    bullet("Keep bonus points simple. Do not over-explain the scoring during the night."),

    // ─── ENERGY CONTROL ───
    sectionHeading("ENERGY CONTROL — HOW TO KEEP THE ROOM UP"),
    bullet("Use PLAY MODE for normal music bingo: listen, mark your sheet, build tension."),
    bullet("Use PARTY MODE for planned energy spikes: card down, eyes up, everyone joins in."),
    bullet("Do not let people feel they have to dance and mark their sheets at the same time. Give them permission to pause the card."),
    bullet("Use short stand-up or hands-up prompts. The room does not need a full dancefloor moment every time."),
    bullet("Reward energy, not just winning. Mention best table energy, best seated dancer, best singer or biggest performance."),

    // ─── USEFUL LINES ───
    sectionHeading("USEFUL LINES DURING THE GAME"),
    scriptLine("Before a big chorus: \"Cards down, eyes up. You are not missing anything - this one is for the room.\""),
    scriptLine("If the room dips: \"I can see you all dancing in your seats. Give me hands in the air if you know this one.\""),
    scriptLine("For table energy: \"Best table energy on this chorus gets bragging rights and bonus points.\""),
    scriptLine("For people with the song on their card: \"If you have this one on your card, stand up if you can and sing the chorus.\""),
    scriptLine("For shy tables: \"You do not have to get up. Seated dancing absolutely counts.\""),
    scriptLine("For a big room moment: \"If you know it, show it.\""),
    scriptLine("For pace: \"Cards back up, eyes down, we are back in the game.\""),
    scriptLine("For tension near the end: \"We are getting close now. Listen carefully, mark quickly, and shout loudly when you have it.\""),
  ];

  // ─── SCHEDULE ───
  children.push(sectionHeading("SCHEDULE"));
  children.push(scheduleItem("Welcome — Yes Sir (Nikki lip sync)"));
  children.push(scheduleItem("Announcements and opening rules"));
  children.push(scheduleItem("Warm-up song in full — Cha Cha Slide by DJ Casper. Nikki uses this to get everyone moving before the game starts."));
  children.push(scheduleItem("KaraFun mobile quiz — Round 1"));
  children.push(scheduleItem(`Music Bingo Game 1 (${game1Theme}) — 50 songs max, with Dancing Challenge included`));
  children.push(scheduleItem("Break — 10 mins"));
  children.push(scheduleItem("KaraFun mobile quiz — Round 2"));
  children.push(scheduleItem(`Music Bingo Game 2 (${game2Theme}) — 50 songs max, different song list, with Sing-Along Challenge included`));
  children.push(scheduleItem("Announcements and upcoming events"));
  children.push(scheduleItem("Sing Along/Out — end-of-night singalong"));

  // ─── WARM-UP SONG ───
  children.push(sectionHeading("WARM-UP SONG"));
  children.push(bullet("Song: Cha Cha Slide — DJ Casper."));
  children.push(bullet("Play in full before the first game starts."));
  children.push(bullet("Purpose: show the room that participation is expected and welcome."));
  children.push(scriptLine("Nikki line: \"Before we start marking cards, we are warming this room up properly. No scoring, no pressure - just get involved.\""));

  // ─── BONUS FUN ───
  children.push(sectionHeading("BONUS FUN"));

  // Game 1 — Dancing Challenge
  if (params.game1.challengeSongs.length > 0) {
    for (let i = 0; i < params.game1.challengeSongs.length; i++) {
      const type = params.game1.challengeTypes?.[i] ?? "dance-along";
      const label = songLabel(params.game1.challengeSongs[i]!);
      children.push(bullet(`${challengeTypeLabel(type)} Challenge — 20 pts — placed in Game 1.`));
      children.push(subBullet(`Song: ${label}`));
    }
  } else {
    children.push(bullet("Dancing Challenge — 20 pts — placed in Game 1. (Song TBD)"));
  }
  children.push(subBullet("Nikki announces the song in advance. Anyone who wants to can get up and dance along. Nikki picks a winner and awards 20 bonus points."));
  children.push(scriptLine("Nikki line: \"Cards down, eyes up. This is our dancing challenge. You can get up, stay seated, wave your arms, do the moves, whatever you can do - I am looking for commitment.\""));

  children.push(spacer());

  // Game 2 — Sing-Along Challenge
  if (params.game2.challengeSongs.length > 0) {
    for (let i = 0; i < params.game2.challengeSongs.length; i++) {
      const type = params.game2.challengeTypes?.[i] ?? "sing-along";
      const label = songLabel(params.game2.challengeSongs[i]!);
      children.push(bullet(`${challengeTypeLabel(type)} Challenge — 20 pts — placed in Game 2.`));
      children.push(subBullet(`Song: ${label}`));
    }
  } else {
    children.push(bullet("Sing-Along Challenge — 20 pts — placed in Game 2. (Song TBD)"));
  }
  children.push(subBullet("Nikki announces the song in advance. Everyone can play. Last person singing the right words wins. If you sing the wrong words, you sit down. Winner gets 20 bonus points."));
  children.push(scriptLine("Nikki line: \"Cards down, eyes up. This is our sing-along challenge. Keep singing the right words for as long as you can. Wrong words or silence means you are out.\""));

  // ─── OPTIONAL BONUS BANGERS ───
  children.push(sectionHeading("OPTIONAL BONUS BANGER MOMENTS"));
  children.push(bullet("Choose 3 to 5 big songs in the running order as bonus bangers."));
  children.push(bullet("When they come up, play the chorus longer and create a quick room moment."));
  children.push(bullet("Keep these simple: hands in the air, loudest table, best seated dance, best air guitar, or everyone sings the chorus."));
  children.push(scriptLine("Nikki line: \"Bonus banger. Cards down, eyes up. I want the whole room on this chorus.\""));

  // ─── UPCOMING EVENTS ───
  children.push(sectionHeading("UPCOMING EVENTS TO ANNOUNCE"));
  children.push(...eventParagraphs(params.upcomingEvents));

  // ─── SET-UP NOTES ───
  children.push(sectionHeading("MUSIC BINGO SET-UP NOTES"));
  children.push(bullet("IMPORTANT: Create two separate games for next time - Game 1 list and Game 2 list. Do not reuse the same pool for both."));
  children.push(bullet("Max 50 songs per game."));
  children.push(bullet(`${normalSongSeconds} seconds per song unless audience participation is high.`));
  children.push(bullet("Keep the bingo simple: hear the song, mark the song, shout when you win."));
  children.push(bullet("The more complicated the scoring feels, the more the energy drops. Let Nikki drive the fun, not the rules."));

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: BODY },
          paragraph: { spacing: { line: 276 } },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: 24, bold: true, color: INK },
          paragraph: {
            spacing: { before: 320, after: 140 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
            keepNext: true,
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: BULLETS_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { run: { color: INK }, paragraph: { indent: { left: 360, hanging: 260 } } },
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: "–",
              alignment: AlignmentType.LEFT,
              style: { run: { color: MUTE }, paragraph: { indent: { left: 720, hanging: 260 } } },
            },
          ],
        },
        {
          reference: SCHEDULE_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { run: { bold: true, color: INK }, paragraph: { indent: { left: 420, hanging: 280 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Music Bingo with Nikki    ·    Page ", size: 16, color: MUTE }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTE }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return new Uint8Array(await Packer.toBuffer(doc));
}
