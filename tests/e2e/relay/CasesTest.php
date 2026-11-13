<?php

declare(strict_types=1);

namespace Polyspec\Relay\E2e;

use PHPUnit\Framework\TestCase;
use Polyspec\Json as Json;
use Polyspec\Relay as Relay;

/**
 * The contract cases of relay run with the extensions of relay and json loaded (V-1, B2.87): a json value crosses carry
 * both ways, and the value that comes back is the value that went in, its strings by their UTF-16 code units (RQ-036,
 * GN-6x).
 */
final class CasesTest extends TestCase
{
    /** @return array<string, list<array<string, mixed>>> */
    private static function cases(): array
    {
        $path = getenv('CASES');
        self::assertIsString($path);
        $cases = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($cases);
        return $cases;
    }

    /**
     * A case value of the class value of json, made by the member of its out row of the kind (G-5).
     *
     * @param array<string, mixed> $given
     */
    private static function value(array $given): Json\Value
    {
        return match ($given['kind']) {
            'null' => Json\Value::null(),
            'bool' => Json\Value::boolean($given['value']),
            'number' => Json\Value::number($given['value']),
            'text' => Json\Value::string($given['value']),
            'text16' => Json\Value::fromUnits($given['value']),
            'list' => Json\Value::array(array_map(self::value(...), $given['value'])),
            'map' => Json\Value::object(self::members($given['value'])),
        };
    }

    /** @param list<array{0: mixed, 1: array<string, mixed>}> $pairs */
    private static function members(array $pairs): Json\OrderedMap
    {
        $members = new Json\OrderedMap();
        foreach ($pairs as [$key, $item]) {
            $members->insert(is_string($key) ? Json\Value::string($key) : self::value($key), self::value($item));
        }
        return $members;
    }

    public function testCarryGivesBackTheValue(): void
    {
        $group = self::cases()['carry'];
        self::assertNotEmpty($group);
        foreach ($group as $case) {
            $given = self::value($case['value']);
            self::assertSame(Json\stringify($given), Json\stringify(Relay\carry($given)), $case['id']);
        }
    }

    public function testAValueAtTheDepthLimit(): void
    {
        $group = self::cases()['carry_deep'];
        self::assertNotEmpty($group);
        foreach ($group as $case) {
            $given = Json\Value::null();
            for ($level = 0; $level < $case['depth']; $level++) {
                $given = Json\Value::array([$given]);
            }
            self::assertSame(Json\stringify($given), Json\stringify(Relay\carry($given)), $case['id']);
        }
    }
}
