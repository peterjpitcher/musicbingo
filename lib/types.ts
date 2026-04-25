export type Song = {
  artist: string;
  title: string;
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
