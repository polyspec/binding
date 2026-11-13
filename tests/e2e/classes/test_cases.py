"""The contract cases of the classes repository run against the installed Python package (V-1): a class unit with a
static member, methods that take arguments and the class, and the hooks of N-4 (T-5, U-2)."""

import json
import os
import unittest

import polyspec.classes as pkg

CASES = os.environ["CASES"]


def load() -> dict:
    with open(CASES, encoding="utf-8") as file:
        return json.load(file)


class ContractCaseTest(unittest.TestCase):
    def test_the_cases_of_the_members_that_give_a_value(self) -> None:
        cases = load()
        self.assertTrue(cases["tag_name"] and cases["tag_to_string"] and cases["tag_repeat"])
        for case in cases["tag_name"]:
            self.assertEqual(pkg.Tag(case["name"]).name, case["result"], case["id"])
        for case in cases["tag_to_string"]:
            self.assertEqual(str(pkg.Tag(case["name"])), case["result"], case["id"])
        for case in cases["tag_repeat"]:
            names = [tag.name for tag in pkg.Tag(case["name"]).repeat(case["count"])]
            self.assertEqual(names, [case["name"]] * case["count"], case["id"])
        for case in cases["tag_parse"]:
            if "raises" not in case:
                self.assertEqual(pkg.Tag.parse(case["text"]).name, case["text"], case["id"])

    def test_a_class_crosses_both_ways(self) -> None:
        a = pkg.Tag("a")
        loud = pkg.shout(a)
        self.assertIsInstance(loud, pkg.Tag)
        self.assertEqual(loud.name, "A")
        self.assertEqual(pkg.join([a, loud]), "a,A")
        self.assertEqual([(key, value.name) for key, value in a.items()], [("a", "a")])
        self.assertEqual(pkg.Tag.parse("b").with_suffix("c").name, "bc")
        self.assertIs(a.same(pkg.Tag("a")), True)
        self.assertIs(a.same(loud), False)
        for tag in a.repeat(3):
            self.assertIsInstance(tag, pkg.Tag)

    def test_a_value_that_is_no_instance_is_kind_invalid_argument_type(self) -> None:
        for bad in (None, 1, "a", {}, {"name": "a"}, object()):
            for call in (lambda: pkg.shout(bad), lambda: pkg.join([bad]), lambda: pkg.Tag("a").same(bad)):
                with self.assertRaises(pkg.ClassesTypeError) as caught:
                    call()
                self.assertEqual(caught.exception.kind, "invalid_argument_type")

    def test_a_static_member_and_a_method_give_the_kind_of_the_core(self) -> None:
        for call in (lambda: pkg.Tag.parse(""), lambda: pkg.Tag("a").with_suffix("")):
            with self.assertRaises(pkg.ClassesValueError) as caught:
                call()
            self.assertIs(type(caught.exception), pkg.ClassesValueError)
            self.assertEqual(caught.exception.kind, "missing")


if __name__ == "__main__":
    unittest.main()
