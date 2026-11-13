"""The contract cases of the consumer sample run against the installed Python package (V-1): the value alias of
another repository crosses the functions and the callback both ways (T-3, U-7 (a'))."""

import json
import os
import unittest

import polyspec.consumer as consumer

CASES = os.environ["CASES"]


def load() -> dict:
    with open(CASES, encoding="utf-8") as file:
        return json.load(file)


def value(given: dict) -> object:
    """A case value of data as the Python value that the alias takes and gives (GN-13)."""
    if given["kind"] == "null":
        return None
    if given["kind"] == "list":
        return [value(item) for item in given["value"]]
    if given["kind"] == "map":
        return {key: value(item) for key, item in given["value"]}
    return given["value"]


class Holder:
    def __init__(self, held: dict) -> None:
        self.held = held

    def get(self, key: str) -> object:
        return self.held.get(key)

    def set(self, key: str, item: object) -> None:
        self.held[key] = item


class ContractCaseTest(unittest.TestCase):
    def test_measure_and_pair(self) -> None:
        cases = load()
        self.assertGreater(len(cases["measure"]), 0)
        self.assertGreater(len(cases["pair"]), 0)
        for case in cases["measure"]:
            with self.subTest(case=case["id"]):
                self.assertEqual(consumer.measure(value(case["value"])), case["result"])
        for case in cases["pair"]:
            with self.subTest(case=case["id"]):
                self.assertEqual(consumer.pair(value(case["value"])), value(case["result"]))

    def test_holder(self) -> None:
        held = {"a": {"k": [1.5, "x", None, True]}}
        self.assertEqual(consumer.fetch(Holder(held), "a"), held["a"])
        self.assertIs(consumer.copy(Holder(held), "a", "b"), True)
        self.assertEqual(held["b"], held["a"])
        self.assertIs(consumer.copy(Holder(held), "c", "d"), False)
        self.assertNotIn("d", held)

    def test_fetch_raises(self) -> None:
        group = load()["fetch"]
        self.assertGreater(len(group), 0)
        for case in group:
            with self.subTest(case=case["id"]):
                with self.assertRaises(consumer.ConsumerValueError) as caught:
                    consumer.fetch(Holder({}), case["key"])
                self.assertIs(type(caught.exception), consumer.ConsumerValueError)
                self.assertEqual(caught.exception.kind, case["raises"]["kind"])
                self.assertEqual(str(caught.exception), case["raises"]["message"])

    def test_refused_by_the_owner(self) -> None:
        """A value that the owner of the alias refuses is its kind in the class of this library."""
        calls = [
            lambda: consumer.measure(len),
            lambda: consumer.pair([len]),
            lambda: consumer.fetch(Holder({"a": len}), "a"),
        ]
        for call in calls:
            with self.assertRaises(consumer.ConsumerValueError) as caught:
                call()
            self.assertIs(type(caught.exception), consumer.ConsumerValueError)
            self.assertEqual(caught.exception.kind, "unsupported")
            self.assertIsNone(caught.exception.status)


if __name__ == "__main__":
    unittest.main()
