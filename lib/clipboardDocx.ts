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

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24 })],
    spacing: { before: 280, after: 120 },
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    text: `•\t${text}`,
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

function italicLine(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, italics: true })],
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
        children: [
          new TextRun({ text: `•\t` }),
          new TextRun({ text: `${evt.name} - ${evt.dateFormatted}: `, bold: true }),
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


  const children: Paragraph[] = [
    // ─── TITLE ───
    new Paragraph({
      children: [new TextRun({ text: "EVENT CLIPBOARD - MUSIC BINGO WITH NIKKI", bold: true, size: 32 })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Date: ", bold: true }),
        new TextRun({ text: eventDate }),
        new TextRun({ text: "    Time: ", bold: true }),
        new TextRun({ text: "8:00 pm - 12:00 am" }),
      ],
      spacing: { after: 240 },
    }),

    // ─── CORE IDEA ───
    sectionHeading("CORE IDEA FOR THE NIGHT"),
    bullet("Music bingo is a party with a game running through it. The music comes first, but the bingo gives the night structure."),
    bullet("People should listen enough to mark their cards, then sing, laugh, dance in their seats and get involved."),
    bullet("Nikki should create two clear modes: PLAY MODE for listening and marking cards, and PARTY MODE for card-down moments."),
    bullet("The aim is not quiet bingo. The aim is a high-energy, interactive music night where the room feels involved from start to finish."),

    // ─── OPENING REMARKS ───
    sectionHeading("OPENING REMARKS - WHAT NIKKI SAYS AT THE START"),
    italicLine("Opening line: \"Welcome to Music Bingo at The Anchor. This is not quiet bingo. This is a party with a game running through it, so sing along, dance in your seats, get involved and make some noise.\""),
    italicLine("How to play: \"You will hear a clip of a song. If that song is on your card, mark it off. When you get 1 line, 2 lines or a full house, shout loudly and quickly. First person to call gets the points, so do not be shy.\""),
    italicLine("Energy rule: \"Most songs will be quick so the game keeps moving, but when I call CARD DOWN, EYES UP, the game pauses for a big singalong, dance moment or room challenge. That means you are not missing anything on your card.\""),
    italicLine("Card-down call-and-response: \"When I say Cards down, you say Eyes up. Cards down?\""),
    italicLine("Kitchen reminder: \"Quick reminder - the kitchen is open until 9 pm, so get your food orders in early.\""),

    // ─── GAME RULES AND POINTS ───
    sectionHeading("GAME RULES AND POINTS"),
    bullet("We will play two separate Music Bingo games using two different song lists."),
    bullet("Song pace: aim for around 40 seconds per song. Keep it moving unless there is big audience participation."),
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
    sectionHeading("ENERGY CONTROL - HOW TO KEEP THE ROOM UP"),
    bullet("Use PLAY MODE for normal music bingo: listen, mark your sheet, build tension."),
    bullet("Use PARTY MODE for planned energy spikes: card down, eyes up, everyone joins in."),
    bullet("Do not let people feel they have to dance and mark their sheets at the same time. Give them permission to pause the card."),
    bullet("Use short stand-up or hands-up prompts. The room does not need a full dancefloor moment every time."),
    bullet("Reward energy, not just winning. Mention best table energy, best seated dancer, best singer or biggest performance."),

    // ─── USEFUL LINES ───
    sectionHeading("USEFUL LINES DURING THE GAME"),
    italicLine("Before a big chorus: \"Cards down, eyes up. You are not missing anything - this one is for the room.\""),
    italicLine("If the room dips: \"I can see you all dancing in your seats. Give me hands in the air if you know this one.\""),
    italicLine("For table energy: \"Best table energy on this chorus gets bragging rights and bonus points.\""),
    italicLine("For people with the song on their card: \"If you have this one on your card, stand up if you can and sing the chorus.\""),
    italicLine("For shy tables: \"You do not have to get up. Seated dancing absolutely counts.\""),
    italicLine("For a big room moment: \"If you know it, show it.\""),
    italicLine("For pace: \"Cards back up, eyes down, we are back in the game.\""),
    italicLine("For tension near the end: \"We are getting close now. Listen carefully, mark quickly, and shout loudly when you have it.\""),
  ];

  // ─── SCHEDULE ───
  children.push(sectionHeading("SCHEDULE"));
  let n = 1;
  children.push(numbered(`${n++}. Welcome - Yes Sir (Nikki lip sync)`));
  children.push(numbered(`${n++}. Announcements and opening rules`));
  children.push(numbered(`${n++}. Warm-up song in full - Cha Cha Slide by DJ Casper. Nikki uses this to get everyone moving before the game starts.`));
  children.push(numbered(`${n++}. KaraFun mobile quiz - Round 1`));
  children.push(numbered(`${n++}. Music Bingo Game 1 - 50 songs max, with Dancing Challenge included`));
  children.push(numbered(`${n++}. Break - 10 mins`));
  children.push(numbered(`${n++}. KaraFun mobile quiz - Round 2`));
  children.push(numbered(`${n++}. Music Bingo Game 2 - 50 songs max, different song list, with Sing-Along Challenge included`));
  children.push(numbered(`${n++}. Announcements and upcoming events`));
  children.push(numbered(`${n++}. Sing Along/Out - end-of-night singalong`));

  // ─── WARM-UP SONG ───
  children.push(sectionHeading("WARM-UP SONG"));
  children.push(bullet("Song: Cha Cha Slide - DJ Casper."));
  children.push(bullet("Play in full before the first game starts."));
  children.push(bullet("Purpose: show the room that participation is expected and welcome."));
  children.push(italicLine("Nikki line: \"Before we start marking cards, we are warming this room up properly. No scoring, no pressure - just get involved.\""));

  // ─── BONUS FUN ───
  children.push(sectionHeading("BONUS FUN"));

  // Game 1 — Dancing Challenge
  if (params.game1.challengeSongs.length > 0) {
    for (let i = 0; i < params.game1.challengeSongs.length; i++) {
      const type = params.game1.challengeTypes?.[i] ?? "dance-along";
      const label = songLabel(params.game1.challengeSongs[i]!);
      children.push(bullet(`${challengeTypeLabel(type)} Challenge - 20 pts - placed in Game 1.`));
      children.push(subBullet(`Song: ${label}`));
    }
  } else {
    children.push(bullet("Dancing Challenge - 20 pts - placed in Game 1. (Song TBD)"));
  }
  children.push(subBullet("Nikki announces the song in advance. Anyone who wants to can get up and dance along. Nikki picks a winner and awards 20 bonus points."));
  children.push(italicLine("Nikki line: \"Cards down, eyes up. This is our dancing challenge. You can get up, stay seated, wave your arms, do the moves, whatever you can do - I am looking for commitment.\""));

  children.push(blankLine());

  // Game 2 — Sing-Along Challenge
  if (params.game2.challengeSongs.length > 0) {
    for (let i = 0; i < params.game2.challengeSongs.length; i++) {
      const type = params.game2.challengeTypes?.[i] ?? "sing-along";
      const label = songLabel(params.game2.challengeSongs[i]!);
      children.push(bullet(`${challengeTypeLabel(type)} Challenge - 20 pts - placed in Game 2.`));
      children.push(subBullet(`Song: ${label}`));
    }
  } else {
    children.push(bullet("Sing-Along Challenge - 20 pts - placed in Game 2. (Song TBD)"));
  }
  children.push(subBullet("Nikki announces the song in advance. Everyone can play. Last person singing the right words wins. If you sing the wrong words, you sit down. Winner gets 20 bonus points."));
  children.push(italicLine("Nikki line: \"Cards down, eyes up. This is our sing-along challenge. Keep singing the right words for as long as you can. Wrong words or silence means you are out.\""));

  // ─── OPTIONAL BONUS BANGERS ───
  children.push(sectionHeading("OPTIONAL BONUS BANGER MOMENTS"));
  children.push(bullet("Choose 3 to 5 big songs in the running order as bonus bangers."));
  children.push(bullet("When they come up, play the chorus longer and create a quick room moment."));
  children.push(bullet("Keep these simple: hands in the air, loudest table, best seated dance, best air guitar, or everyone sings the chorus."));
  children.push(italicLine("Nikki line: \"Bonus banger. Cards down, eyes up. I want the whole room on this chorus.\""));

  // ─── UPCOMING EVENTS ───
  children.push(sectionHeading("UPCOMING EVENTS TO ANNOUNCE"));
  children.push(...eventParagraphs(params.upcomingEvents));

  // ─── SET-UP NOTES ───
  children.push(sectionHeading("MUSIC BINGO SET-UP NOTES"));
  children.push(bullet("IMPORTANT: Create two separate games for next time - Game 1 list and Game 2 list. Do not reuse the same pool for both."));
  children.push(bullet("Max 50 songs per game."));
  children.push(bullet("40 seconds per song unless audience participation is high."));
  children.push(bullet("Keep the bingo simple: hear the song, mark the song, shout when you win."));
  children.push(bullet("The more complicated the scoring feels, the more the energy drops. Let Nikki drive the fun, not the rules."));

  // ─── SONG LISTS ───
  children.push(sectionHeading(`MUSIC BINGO GAME 1 (${game1Theme})`));
  children.push(...songsBlock(params.game1.songs));

  children.push(blankLine());
  children.push(sectionHeading(`MUSIC BINGO GAME 2 (${game2Theme})`));
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
