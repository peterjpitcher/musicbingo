export type Song = {
  artist: string;
  title: string;
};

export type ParseResult = {
  songs: Song[];
  uniqueArtists: string[];
  uniqueTitles: string[];
  ignoredLines: string[];
};

export type Card = {
  artists: string[];
  titles: string[];
  cardId: string;
};

export type FooterQrItem = {
  label: string;
  url: string | null;
};
