export type Song = {
  artist: string;
  title: string;
  /**
   * Where the song should start on the night, in ms, from a trailing start
   * time in the song list ("Artist - Title @0:40"). Absent means the top.
   */
  startMs?: number;
};

export type ParseResult = {
  songs: Song[];
  uniqueArtists: string[];
  uniqueTitles: string[];
  combinedPool: string[];
  ignoredLines: string[];
};

export type Card = {
  items: string[];
  cardId: string;
};

export type FooterQrItem = {
  label: string;
  url: string | null;
};
