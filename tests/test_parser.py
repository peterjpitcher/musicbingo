from music_bingo.core.parser import parse_song_list_text


def test_parse_ignores_headers_and_splits_artist_title():
    text = """
    1950s (25)

    Elvis Presley – Jailhouse Rock
    Chuck Berry - Johnny B. Goode
    NotAValidLine
    """
    result = parse_song_list_text(text)
    assert ("Elvis Presley", "Jailhouse Rock") in result.songs
    assert ("Chuck Berry", "Johnny B. Goode") in result.songs
    assert any("1950s" in line for line in result.ignored_lines)
    assert any("NotAValidLine" in line for line in result.ignored_lines)

