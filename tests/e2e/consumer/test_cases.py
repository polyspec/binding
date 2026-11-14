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


def value(given: dict, ids: dict | None = None) -> object:
    """A case value of data as the Python value that the alias takes and gives (GN-13): a reference is an instance of
    the class Cell of the owner of the alias (GN-6ar), made once per id and set after it is made, so every place of
    an id holds the same instance."""
    ids = {} if ids is None else ids
    if given["kind"] == "null":
        return None
    if given["kind"] == "list":
        return [value(item, ids) for item in given["value"]]
    if given["kind"] == "map":
        return {key: value(item, ids) for key, item in given["value"]}
    if given["kind"] == "reference":
        if "value" not in given["value"]:
            return ids[given["value"]["id"]]
        cell = sample.Cell()
        ids[given["value"]["id"]] = cell
        cell.value = value(given["value"]["value"], ids)
        return cell
    return given["value"]


def shape(held: object, cells: dict | None = None) -> object:
    """The places of a value in pre-order, as the generated tests compare them (GN-13e): an instance of Cell is
    numbered by its first place and named by that number at a later place, so the identity of each place is
    compared."""
    cells = {} if cells is None else cells
    if isinstance(held, sample.Cell):
        if id(held) in cells:
            return ("again", cells[id(held)])
        cells[id(held)] = len(cells)
        return ("cell", cells[id(held)], shape(held.value, cells))
    if isinstance(held, list):
        return [shape(item, cells) for item in held]
    if isinstance(held, dict):
        return {key: shape(item, cells) for key, item in held.items()}
    return held


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
                self.assertEqual(shape(consumer.pair(value(case["value"]))), shape(value(case["result"])))

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
