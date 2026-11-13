"""The contract cases of relay run against the installed Python packages of relay and json (V-1, B2.87): a json value
crosses carry both ways, and the value that comes back is the value that went in, its strings by their UTF-16 code
units (RQ-036, GN-6x)."""

import json as cases_json
import os
import unittest

import polyspec.json as json
import polyspec.relay as relay

CASES = os.environ["CASES"]


def load() -> dict:
    with open(CASES, encoding="utf-8") as file:
        return cases_json.load(file)


def value(given: dict) -> json.Value:
    """A case value of the class value of json, made by the member of its out row of the kind (G-5)."""
    kind = given["kind"]
    if kind == "null":
        return json.Value.null()
    if kind == "bool":
        return json.Value.boolean(given["value"])
    if kind == "number":
        return json.Value.number(given["value"])
    if kind == "text":
        return json.Value.string(given["value"])
    if kind == "text16":
        return json.Value.from_units(given["value"])
    if kind == "list":
        return json.Value.array([value(item) for item in given["value"]])
    if kind == "map":
        members = json.OrderedMap()
        for key, item in given["value"]:
            members.insert(json.Value.string(key) if isinstance(key, str) else value(key), value(item))
        return json.Value.object(members)
    raise ValueError(f"no case value of the kind {kind}")


class ContractCaseTest(unittest.TestCase):
    def test_carry_gives_back_the_value(self) -> None:
        group = load()["carry"]
        self.assertGreater(len(group), 0)
        for case in group:
            with self.subTest(case=case["id"]):
                given = value(case["value"])
                self.assertEqual(json.stringify(relay.carry(given)), json.stringify(given))

    def test_a_value_at_the_depth_limit(self) -> None:
        group = load()["carry_deep"]
        self.assertGreater(len(group), 0)
        for case in group:
            with self.subTest(case=case["id"]):
                given = json.Value.null()
                for _ in range(case["depth"]):
                    given = json.Value.array([given])
                self.assertEqual(json.stringify(relay.carry(given)), json.stringify(given))


if __name__ == "__main__":
    unittest.main()
