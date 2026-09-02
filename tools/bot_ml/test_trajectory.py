import json
import tempfile
import unittest
from pathlib import Path

from tools.bot_ml.schema import (
    ACTION_NAMES,
    FEATURE_NAMES,
    OBSERVATION_SIZE,
    SCHEMA_FINGERPRINT,
    SCHEMA_VERSION,
)
from tools.bot_ml.trajectory import validate_trajectory_file


def sample_record():
    return {
        "recordType": "sample",
        "atMs": 1000016,
        "episodeId": "episode-1",
        "seed": 42,
        "botId": "bot",
        "hero": "Needle",
        "policy": "utility-v1",
        "observation": {
            "schemaVersion": SCHEMA_VERSION,
            "values": [0.0] * OBSERVATION_SIZE,
            "actionMask": [True, True, False, False],
        },
        "action": 1,
    }


class TrajectoryContractTests(unittest.TestCase):
    def write_records(self, records):
        handle = tempfile.NamedTemporaryFile(
            "w", suffix=".jsonl", delete=False, encoding="utf-8"
        )
        path = Path(handle.name)
        with handle:
            for record in records:
                handle.write(json.dumps(record) + "\n")
        self.addCleanup(path.unlink, missing_ok=True)
        return path

    def header(self):
        return {
            "recordType": "header",
            "schemaVersion": SCHEMA_VERSION,
            "schemaFingerprint": SCHEMA_FINGERPRINT,
            "observationSize": OBSERVATION_SIZE,
            "featureNames": FEATURE_NAMES,
            "actionNames": ACTION_NAMES,
        }

    def test_schema_metadata_is_stable(self):
        self.assertEqual(len(FEATURE_NAMES), OBSERVATION_SIZE)
        self.assertEqual(ACTION_NAMES, ["roam", "engage", "retreat", "collect_pickup"])
        self.assertEqual(
            SCHEMA_FINGERPRINT,
            "b5d0859ca5d96741d11034c7b19329b6bcf36dbaae9a7310f156ec5996d542e5",
        )

    def test_valid_jsonl_trajectory_is_accepted(self):
        path = self.write_records([self.header(), sample_record()])
        self.assertEqual(validate_trajectory_file(path), 1)

    def test_schema_and_mask_mismatches_are_rejected(self):
        bad_header = self.header()
        bad_header["schemaFingerprint"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "fingerprint"):
            validate_trajectory_file(self.write_records([bad_header, sample_record()]))

        bad_sample = sample_record()
        bad_sample["observation"]["values"] = [0.0]
        with self.assertRaisesRegex(ValueError, "values"):
            validate_trajectory_file(self.write_records([self.header(), bad_sample]))

        bad_action = sample_record()
        bad_action["action"] = 2
        bad_action["observation"]["actionMask"][2] = False
        with self.assertRaisesRegex(ValueError, "mask"):
            validate_trajectory_file(self.write_records([self.header(), bad_action]))


if __name__ == "__main__":
    unittest.main()
