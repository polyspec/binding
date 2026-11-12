"""The contract cases of http-cookie run against the installed Python package (V-1)."""

import json
import os
import unittest

import polyspec.http_cookie as cookies

CASES = os.environ["CASES"]


def load() -> dict:
    with open(CASES, encoding="utf-8") as file:
        return json.load(file)


class ContractCaseTest(unittest.TestCase):
    def test_parse(self) -> None:
        group = load()["parse"]
        self.assertGreater(len(group), 0)
        for case in group:
            with self.subTest(case=case["id"]):
                got = cookies.parse_cookie(case["lines"])
                self.assertEqual([list(pair) for pair in got], case["cookies"])

    def test_set_cookie(self) -> None:
        group = load()["set_cookie"]
        self.assertGreater(len(group), 0)
        for case in group:
            with self.subTest(case=case["id"]):
                attributes = case["attributes"]
                same_site = attributes["same_site"]
                call = lambda: cookies.set_cookie(  # noqa: E731
                    case["name"],
                    case["value"],
                    path=attributes["path"],
                    max_age=attributes["max_age"],
                    secure=attributes["secure"],
                    http_only=attributes["http_only"],
                    same_site=None if same_site is None else cookies.SameSite(same_site),
                )
                if "raises" in case:
                    raises = case["raises"]
                    with self.assertRaises(Exception) as caught:
                        call()
                    error = caught.exception
                    self.assertEqual(error.kind, raises["kind"])
                    self.assertEqual(error.status, raises["status"])
                    category = raises["category"].capitalize()
                    self.assertIs(type(error), getattr(cookies, f"HTTPCookie{category}Error"))
                    if raises["message"] is not None:
                        self.assertEqual(str(error), raises["message"])
                else:
                    self.assertEqual(call(), case["header"])


if __name__ == "__main__":
    unittest.main()
