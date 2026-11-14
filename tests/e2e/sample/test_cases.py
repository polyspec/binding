"""GN-6at: host-container cycles differ from depth, and sharing is not a cycle."""

import unittest

import polyspec.sample as sample


class HostContainerTest(unittest.TestCase):
    def test_self_containing_list_and_dict_are_cycles(self) -> None:
        listed: list[object] = []
        listed.append(listed)
        mapped: dict[str, object] = {}
        mapped["self"] = mapped
        for value in (listed, mapped):
            with self.subTest(container=type(value).__name__):
                with self.assertRaises(sample.SampleValueError) as caught:
                    sample.size(value)
                self.assertEqual(caught.exception.kind, "unsupported")
                self.assertEqual(str(caught.exception), "not data: a container cycle")

    def test_shared_containers_are_not_cycles_and_deep_values_reach_depth_limit(self) -> None:
        shared = {"value": [1]}
        self.assertEqual(sample.size([shared, shared]), 2)
        nested = None
        for _ in range(65):
            nested = [nested]
        with self.assertRaisesRegex(sample.SampleValueError, "a value nested too deep"):
            sample.size(nested)
