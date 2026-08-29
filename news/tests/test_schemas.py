import pytest
from pydantic import ValidationError

from news.schemas import ReleaseNewsCreate


def test_release_payload_accepts_semver_tag_and_sha():
    payload = ReleaseNewsCreate(tag="v0.0.2", commit="a" * 40)
    assert payload.tag == "v0.0.2"


def test_release_payload_rejects_untrusted_tag():
    with pytest.raises(ValidationError):
        ReleaseNewsCreate(tag="latest", commit="a" * 40)
