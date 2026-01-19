import pytest

from music_bingo.core.generator import generate_cards


def test_generate_cards_unique_and_well_formed():
    artists = [f"Artist {i}" for i in range(60)]
    titles = [f"Song {i}" for i in range(60)]

    cards = generate_cards(unique_artists=artists, unique_titles=titles, count=100, seed=123)
    assert len(cards) == 100

    sigs = set()
    for card in cards:
        assert len(card.artists) == 25
        assert len(card.titles) == 25
        assert len(set(card.artists)) == 25
        assert len(set(card.titles)) == 25
        sigs.add((card.artists, card.titles))

    assert len(sigs) == 100


@pytest.mark.parametrize(
    "artists,titles",
    [
        ([], ["t"] * 30),
        (["a"] * 30, []),
        ([f"a{i}" for i in range(24)], [f"t{i}" for i in range(30)]),
        ([f"a{i}" for i in range(30)], [f"t{i}" for i in range(24)]),
    ],
)
def test_generate_cards_requires_25_unique_each(artists, titles):
    with pytest.raises(ValueError):
        generate_cards(unique_artists=artists, unique_titles=titles, count=1, seed=1)

