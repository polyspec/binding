"""The contract cases of the consumer sample run against the installed Python package (V-1): the value alias of
another repository crosses the functions and the callback both ways (T-3, U-7 (a'))."""

import json
import os
import unittest

import polyspec.consumer as consumer
import polyspec.sample as sample

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


def plain(given: object) -> bool:
    """GN-6ar: a case value with a node of kind reference is an instance of a class of the owner, which the generated
    tests (GN-13e) make and compare by its tokens; these tests read the plain data of the alias only."""
    if not isinstance(given, dict):
        return True
    if given["kind"] == "reference":
        return False
    if isinstance(given["value"], list):
        return all(plain(item[1]) if isinstance(item, list) else plain(item) for item in given["value"])
    return True


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
        for case in filter(lambda case: plain(case["value"]), cases["pair"]):
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
                # E-2, I-3: the kind has the class of its error unit, whose properties the core error gives.
                self.assertIs(type(caught.exception), consumer.AbsentError)
                self.assertEqual(caught.exception.kind, case["raises"]["kind"])
                self.assertEqual(str(caught.exception), case["raises"]["message"])
                self.assertEqual(caught.exception.key, case["key"])
                self.assertEqual(caught.exception.length, len(case["key"]))
                with self.assertRaises(AttributeError):
                    caught.exception.key = "other"
        with self.assertRaises(consumer.AbsentError) as caught:
            consumer.fetch(Holder({}), "")
        self.assertEqual(caught.exception.key, "")
        self.assertIsNone(caught.exception.length)

    def test_refused_by_the_owner(self) -> None:
        """A value that the owner of the alias refuses is its kind in the class of this library."""
        # The owner refuses a map with a key that is no text and a text with an unpaired surrogate; a callable is data of
        # the owner, which keeps it as a Native (GN-6u).
        for name, refused in (("a key that is no text", {5: "x"}), ("an unpaired surrogate", "\ud800")):
            calls = [
                lambda: consumer.measure(refused),
                lambda: consumer.pair([refused]),
                lambda: consumer.fetch(Holder({"a": refused}), "a"),
            ]
            for index, call in enumerate(calls):
                with self.subTest(refused=name, call=index):
                    with self.assertRaises(consumer.ConsumerValueError) as caught:
                        call()
                    self.assertIs(type(caught.exception), consumer.ConsumerValueError)
                    self.assertEqual(caught.exception.kind, "unsupported")
                    self.assertIsNone(caught.exception.status)

    def test_classes_of_the_owner(self) -> None:
        """An instance of a class of the owner that a row of the alias names crosses both ways (GN-6ar)."""
        # The keys of a map without entries are the indexes of its entries, so the owner gives it as a box.
        for box in consumer.pair(sample.Box({})):
            self.assertIs(type(box), sample.Box)
            self.assertEqual(box.entries, {})
        for cell in consumer.pair(sample.Cell("x")):
            self.assertIs(type(cell), sample.Cell)
            self.assertEqual(cell.value, "x")


if __name__ == "__main__":
    unittest.main()
